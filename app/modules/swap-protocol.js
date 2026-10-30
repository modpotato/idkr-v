"use strict";

let path = require("path");
let { pathToFileURL } = require("url");
let { protocol, net } = require("electron");

/**
 * Register the idkr-swap protocol handler.
 *
 * Must be called after the app is ready and after the scheme has been
 * registered as privileged.
 *
 * @param {string} swapDir
 */
function register(swapDir) {
	protocol.handle("idkr-swap", async request => {
		// Strip the scheme and, on Windows, the leading slash in front of the drive letter
		let filePath = path.resolve(decodeURI(request.url.replace(/^idkr-swap:/, "")).replace(/^[/\\]+(?=[a-zA-Z]:)/, ""));
		let swapRoot = path.resolve(swapDir);

		// Only ever serve files from within the swap directory, never arbitrary local files
		let normalize = p => process.platform === "win32" ? p.toLowerCase() : p;
		if (!normalize(filePath).startsWith(normalize(swapRoot + path.sep))) return new Response("Forbidden", { status: 403 });

		let response = await net.fetch(pathToFileURL(filePath).toString());
		let headers = new Headers(response.headers);
		headers.set("Access-Control-Allow-Origin", "*");
		return new Response(response.body, { status: response.status, headers });
	});
}

module.exports = {
	register
};
