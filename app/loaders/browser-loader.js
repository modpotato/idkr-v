"use strict";
let path = require("path");

let { BrowserWindow, app, shell, dialog, clipboard } = require("electron");
let log = require("electron-log");
let shortcuts = require("electron-localshortcut");

let UrlUtils = require("../utils/url-utils");
let PathUtils = require("../utils/path-utils");
let WindowUtils = require("../utils/window-utils");
let Swapper = require("../modules/swapper");

class BrowserLoader {
	static load(isDebug = false, config) {
		this.DEBUG = isDebug;
		/** @type {string} */
		let swapDirConfig = (config.get("resourceSwapperPath", ""));
		this.swapDir = PathUtils.isValidPath(swapDirConfig) ? swapDirConfig : path.join(app.getPath("documents"), "idkr/swap");
	}

	/**
	 * Get the swap dir path
	 *
	 * @static
	 * @return {string}
	 * @memberof BrowserLoader
	 */
	static getSwapDir() {
		return this.swapDir;
	}

	/**
	 * Window options for game windows
	 *
	 * @static
	 * @returns {import("electron").BrowserWindowConstructorOptions}
	 * @memberof BrowserLoader
	 */
	static getWindowOptions() {
		return {
			width: 1600,
			height: 900,
			show: false,
			webPreferences: {
				preload: path.join(__dirname, "../preload/global.js"),
				// The preload script uses Node modules and shares the page's world to hook into the game
				contextIsolation: false,
				sandbox: false
				// nodeIntegrationInWorker: true
			}
		};
	}

	/**
	 * Open a URL in the default browser, but only if it is a plain web link
	 *
	 * @static
	 * @param {string} url
	 * @memberof BrowserLoader
	 */
	static openExternal(url) {
		if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url);
	}

	/**
	 * Initialize the browser window
	 *
	 * @param {string} url
	 * @param {import("electron-store")} config
	 * @returns
	 */
	static initWindow(url, config) {
		let win = new BrowserWindow(this.getWindowOptions());

		this.setupWindow(win, config, true);
		win.loadURL(url);

		return win;
	}

	/**
	 * Set window defaults
	 *
	 * @param {BrowserWindow} win
	 * @param {import("electron-store")} config
	 * @param {Boolean} [isWeb=false]
	 * @returns {any}
	 */
	static setupWindow(win, config, isWeb = false) {
		let contents = win.webContents;

		if (this.DEBUG) WindowUtils.openDevToolsWithFallback(win);

		win.removeMenu();
		win.once("ready-to-show", () => {
			let windowType = UrlUtils.locationType(contents.getURL());

			win.on("maximize", () => config.set(`windowState.${windowType}.maximized`, true));
			win.on("unmaximize", () => config.set(`windowState.${windowType}.maximized`, false));
			win.on("enter-full-screen", () => config.set(`windowState.${windowType}.fullScreen`, true));
			win.on("leave-full-screen", () => config.set(`windowState.${windowType}.fullScreen`, false));

			/** @type {object} */
			let windowStateConfig = (config.get("windowState." + windowType, {}));
			if (windowStateConfig.maximized) win.maximize();
			if (windowStateConfig.fullScreen) win.setFullScreen(true);

			win.show();
		});

		let isMac = process.platform === "darwin";
		shortcuts.register(win, [isMac ? "Command+Option+I" : "Control+Shift+I", "F12"], () => WindowUtils.openDevToolsWithFallback(win));
		shortcuts.register(win, isMac ? "Command+Left" : "Alt+Left", () => contents.canGoBack() && contents.goBack());
		shortcuts.register(win, isMac ? "Command+Right" : "Alt+Right", () => contents.canGoForward() && contents.goForward());
		shortcuts.register(win, "CommandOrControl+Shift+Delete", () => {
			contents.session.clearCache().then(() => {
				app.relaunch();
				app.quit();
			});
		});
		shortcuts.register(win, "Escape", () => contents.executeJavaScript("document.exitPointerLock()", true));
		shortcuts.register(win, "Control+F1", () => {
			config.clear();
			app.relaunch();
			app.quit();
		});
		shortcuts.register(win, "Shift+F1", () => config.openInEditor());

		if (!isWeb) return win;

		// Codes only runs on web windows

		win.once("ready-to-show", () => {
			let windowType = UrlUtils.locationType(contents.getURL());

			win.on("maximize", () => config.set(`windowState.${windowType}.maximized`, true));
			win.on("unmaximize", () => config.set(`windowState.${windowType}.maximized`, false));
			win.on("enter-full-screen", () => config.set(`windowState.${windowType}.fullScreen`, true));
			win.on("leave-full-screen", () => config.set(`windowState.${windowType}.fullScreen`, false));

			/** @type {object} */
			let windowStateConfig = (config.get("windowState." + windowType, {}));
			if (windowStateConfig.maximized) win.maximize();
			if (windowStateConfig.fullScreen) win.setFullScreen(true);
		});

		contents.on("dom-ready", () => (
			(UrlUtils.locationType(contents.getURL()) === "game")
			&& (shortcuts.register(win, "F6", () => win.loadURL("https://krunker.io/"))))
		);

		contents.setWindowOpenHandler(({ url, frameName }) => {
			let type = UrlUtils.locationType(url);
			if (type === "external") this.openExternal(url);
			else if (type !== "unknown") {
				if (frameName === "_self") contents.loadURL(url);
				else return { action: "allow", overrideBrowserWindowOptions: this.getWindowOptions() };
			}
			return { action: "deny" };
		});
		contents.on("did-create-window", childWin => this.setupWindow(childWin, config, true));

		contents.on("will-navigate", (event, legacyUrl) => {
			let url = event.url || legacyUrl;
			event.preventDefault();
			if (UrlUtils.locationType(url) === "external") this.openExternal(url);
			else if (UrlUtils.locationType(url) !== "unknown") contents.loadURL(url);
		});

		contents.on("will-prevent-unload", event => {
			if (!dialog.showMessageBoxSync({
				buttons: ["Leave", "Cancel"],
				title: "Leave site?",
				message: "Changes you made may not be saved.",
				noLink: true
			})) event.preventDefault();
		});

		shortcuts.register(win, "F5", () => contents.reload());
		shortcuts.register(win, "Shift+F5", () => contents.reloadIgnoringCache());
		shortcuts.register(win, "F11", () => win.setFullScreen(!win.isFullScreen()));
		shortcuts.register(win, "CommandOrControl+L", () => clipboard.writeText(contents.getURL()));
		shortcuts.register(win, "CommandOrControl+N", () => this.initWindow("https://krunker.io/", config));
		shortcuts.register(win, "CommandOrControl+Shift+N", () => this.initWindow(contents.getURL(), config));
		shortcuts.register(win, "CommandOrControl+Alt+R", () => {
			app.relaunch();
			app.quit();
		});

		let swapper = new Swapper(
			win,
			/** @type {string} */(config.get("resourceSwapperMode", "normal")),
			/** @type {string} */(this.swapDir)
		);
		swapper.init();

		return win;
	}

	/**
	 * Default prompt window configuration
	 *
	 * @static
	 * @param {string} message
	 * @param {object} defaultValue
	 * @param {import("electron-store")} config
	 * @returns {any}
	 * @memberof BrowserLoader
	 */
	static initPromptWindow(message, defaultValue, config = null) {
		let win = new BrowserWindow({
			width: 480,
			height: 240,
			center: true,
			show: false,
			frame: false,
			resizable: false,
			transparent: true,
			webPreferences: {
				preload: path.join(__dirname, "../preload/prompt.js")
			}
		});
		let contents = win.webContents;

		this.setupWindow(win, config);
		win.once("ready-to-show", () => contents.send("prompt-data", message, defaultValue));

		win.loadFile("app/html/prompt.html");

		return win;
	}

	/**
	 * Default splash window configuration
	 *
	 * @static
	 * @param {string} shouldAutoUpdate
	 * @param {import("electron-store")} config
	 * @returns {any}
	 * @memberof BrowserLoader
	 */
	static initSplashWindow(shouldAutoUpdate, config) {
		let win = new BrowserWindow({
			width: 600,
			height: 300,
			center: true,
			resizable: false,
			show: false,
			frame: false,
			transparent: true,
			webPreferences: {
				preload: path.join(__dirname, "../preload/splash.js")
			}
		});
		let contents = win.webContents;

		async function autoUpdate() {
			return new Promise((resolve, reject) => {
				if (shouldAutoUpdate === "skip") return resolve();

				return contents.on("dom-ready", () => {
					contents.send("message", "Initializing the auto updater...");
					const { autoUpdater } = require("electron-updater");
					autoUpdater.logger = log;

					autoUpdater.on("error", err => {
						console.error(err);
						contents.send("message", "Error: " + err.name);
						reject(`Error occurred: ${err.name}`);
					});
					autoUpdater.on("checking-for-update", () => contents.send("message", "Checking for update"));
					autoUpdater.on("update-available", info => {
						console.log(info);
						contents.send("message", `Update v${info.version} available`, info.releaseDate);
						if (shouldAutoUpdate !== "download") resolve();
					});
					autoUpdater.on("update-not-available", info => {
						console.log(info);
						contents.send("message", "No update available");
						resolve();
					});
					autoUpdater.on("download-progress", info => {
						contents.send("message", `Downloaded ${Math.floor(info.percent)}%`, Math.floor(info.bytesPerSecond / 1000) + "kB/s");
						win.setProgressBar(info.percent / 100);
					});
					autoUpdater.on("update-downloaded", info => {
						contents.send("message", null, `Installing v${info.version}...`);
						autoUpdater.quitAndInstall(true, true);
					});

					autoUpdater.autoDownload = shouldAutoUpdate === "download";
					// Resolves with null, without emitting any event, if the updater isn't active (e.g. Linux builds that aren't AppImages)
					autoUpdater.checkForUpdates().then(result => result || resolve()).catch(reject);
				});
			});
		}

		function launchGame() {
			BrowserLoader.initWindow("https://krunker.io/", config);
			setTimeout(() => win.destroy(), 2000);
		}

		autoUpdate().catch(err => console.error("Auto update failed", err)).finally(() => launchGame());

		BrowserLoader.setupWindow(win, config);
		win.loadFile("app/html/splash.html");
		return win;
	}
}

module.exports = BrowserLoader;
