import docker from "@/lib/docker";
import { db } from "@/lib/drizzle/db";
import { session, user } from "@/lib/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { Session } from "next-auth";

async function createSession(Image: string, userSession: Session) {
	console.log(`Creating session with image ${Image}`);
	try {
		if (!userSession || !userSession.user) throw new Error("User not found");
		if (!process.env.DOCKER_PORT_RANGE)
			throw new Error("Docker port range not set");
		const portsRange = process.env.DOCKER_PORT_RANGE.split("-").map(Number);
		let vncPort: number =
			Math.floor(Math.random() * (portsRange[1] - portsRange[0] + 1)) +
			portsRange[0];
		const portInUse = await docker
			.listContainers({ all: true })
			.then((containers) =>
				containers
					.map((container) => container.Ports?.map((port) => port.PublicPort))
					.flat(),
			);
		while (portInUse.includes(vncPort)) {
			vncPort =
				Math.floor(Math.random() * (portsRange[1] - portsRange[0] + 1)) +
				portsRange[0];
		}
		await docker.pull(Image).catch(console.error);
		const container = await docker
			.createContainer({
				name: `session-${Date.now()}-${userSession.user.email?.split("@")[0]}`,
				Image,
				HostConfig: {
					PortBindings: {
						"5901/tcp": [
							{ hostIp: "0.0.0.0" },
							{ HostPort: vncPort.toString() },
						],
					},
				},
			})
			.catch(console.error);
		if (!container) throw new Error("Container not created");
		await container.start();
		const { userId } = (
			await db
				.select({
					userId: user.id,
				})
				.from(user)
				.where(eq(user.email, userSession.user.email as string))
		)[0];
		return await db
			.insert(session)
			.values({
				id: container.id,
				dockerImage: Image,
				createdAt: Date.now().toString(),
				expiresAt: (Date.now() + 1000 * 60 * 60 * 24).toString(),
				userId,
				vncPort,
			})
			.returning();
	} catch (error) {
		console.error(error);
	}
}
async function deleteSession(id: string, userSession: Session) {
	if (!userSession || !userSession.user) throw new Error("User not found");
	const { userId } = (
		await db
			.select({
				userId: user.id,
			})
			.from(user)
			.where(eq(user.email, userSession.user.email as string))
	)[0];
	try {
		const containerSession = await db
			.select()
			.from(session)
			.where(and(eq(session.id, id), eq(session.userId, userId)));
		if (!containerSession.length) throw new Error("Session not found");
		const container = docker.getContainer(id);
		await container.stop();
		await container.remove();
		await db.delete(session).where(eq(session.id, id));
	} catch (error) {
		console.error(error);
	}
}
export { createSession, deleteSession };
