"use strict";

let fs = require("fs");
let path = require("path");

/**
 * Swapping Handler
 *
 * @class Swapper
 */
class Swapper {
	/**
	 * Creates an instance of Swapper.
	 *
	 * @param {string} swapperMode
	 * @param {string} swapDir
	 * @memberof Swapper
	 */
	constructor(swapperMode, swapDir) {
		this.swapperMode = swapperMode;
		this.swapDir = swapDir;

		/**
		 * Maps "hostname/pathname" to the local file that replaces it
		 *
		 * @type {Map<string, string>}
		 */
		this.routes = new Map();
		this.handler = details => this.#handleRequest(details);
	}

	/**
	 * Adds a route for a host and pathname
	 *
	 * @private
	 * @param {string} hostname
	 * @param {string} pathname
	 * @param {string} filePath
	 * @memberof Swapper
	 */
	#addRoute = (hostname, pathname, filePath) => {
		this.routes.set(hostname + pathname, filePath);
	};

	/**
	 * Normal Swapper
	 *
	 * @private
	 * @param {string} [prefix=""]
	 * @memberof Swapper
	 */
	#recursiveSwapNormal = (prefix = "") => {
		try {
			fs.readdirSync(path.join(this.swapDir, prefix), { withFileTypes: true }).forEach(dirent => {
				if (dirent.isDirectory()) this.#recursiveSwapNormal(`${prefix}/${dirent.name}`);
				else {
					let pathname = `${prefix}/${dirent.name}`;
					let filePath = path.join(this.swapDir, pathname);
					let isAssetsOnly = /^\/(?:models|scares|sound|textures|videos)\//.test(pathname);
					// Both the main and the assets domain serve files from /img
					let isOnAssets = isAssetsOnly || /^\/img\//.test(pathname);

					if (isOnAssets) this.#addRoute("assets.krunker.io", pathname, filePath);
					if (!isAssetsOnly) {
						this.#addRoute("krunker.io", pathname, filePath);
						this.#addRoute("comp.krunker.io", pathname, filePath);
					}
				}
			});
		}
		catch (err) {
			console.error("Failed to swap resources in normal mode", err, prefix);
		}
	};

	/**
	 * Advanced Swapper
	 *
	 * @private
	 * @param {string} [prefix=""]
	 * @param {string} [hostname=""]
	 * @memberof Swapper
	 */
	#recursiveSwapHostname = (prefix = "", hostname = "") => {
		try {
			fs.readdirSync(path.join(this.swapDir, prefix), { withFileTypes: true }).forEach(dirent => {
				if (dirent.isDirectory()) {
					this.#recursiveSwapHostname(
						hostname ? `${prefix}/${dirent.name}` : prefix + dirent.name,
						hostname || dirent.name
					);
				}
				else if (hostname) {
					this.#addRoute(
						hostname,
						`/${[...prefix.split("/").slice(1), dirent.name].join("/")}`,
						path.join(this.swapDir, prefix, dirent.name)
					);
				}
			});
		}
		catch (err) {
			console.error("Failed to swap resources in advanced mode", err, prefix, hostname);
		}
	};

	/**
	 * @private
	 * @param {Electron.OnBeforeRequestListenerDetails} details
	 * @returns {Electron.CallbackResponse | null}
	 * @memberof Swapper
	 */
	#handleRequest = (details) => {
		if (this.routes.size === 0) return null;

		let url;
		try {
			url = new URL(details.url);
		}
		catch {
			return null;
		}

		if (url.protocol !== "http:" && url.protocol !== "https:") return null;

		let filePath = this.routes.get(url.hostname + url.pathname);
		return filePath ? { redirectURL: "idkr-swap:/" + filePath } : null;
	};

	/**
	 * Initialize the Swapping process
	 *
	 * @param {import("./request-manager")} requestManager
	 * @memberof Swapper
	 */
	init(requestManager) {
		switch (this.swapperMode) {
			case "normal": {
				this.#recursiveSwapNormal();
				break;
			}
			case "advanced": {
				this.#recursiveSwapHostname();
				break;
			}
			default: return;
		}

		if (this.routes.size > 0) requestManager.addHandler(this.handler);
	}
}

module.exports = Swapper;
