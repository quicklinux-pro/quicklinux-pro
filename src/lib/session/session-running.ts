"use server";

import { consola } from "consola";

/**
 * While loop for checking if the container is running.
 * @param port The port of the container to check
 */
async function sessionRunning(ip: string) {
	let containerRunning = await fetch(`http://${ip}:6080/healthcheck`)
		.then((res) => res.json())
		.then((data) => data.message)
		.catch(() => consola.warn(`✨ Stardust: Container on ${ip} not running, retrying...`));
	while (!containerRunning) {
		await new Promise((resolve) => setTimeout(resolve, 2000));
		containerRunning = await fetch(`http://${ip}:6080/healthcheck`)
			.then((res) => res.json())
			.then((data) => data.message)
			.catch(() => consola.warn(`✨ Stardust: Container on ${ip} not running, retrying...`));
	}
}
export { sessionRunning };
