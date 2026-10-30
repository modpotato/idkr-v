"use strict";

let path = require("path");
let fs = require("fs");
let os = require("os");
let crypto = require("crypto");
let { app, BrowserWindow, ipcMain, session, protocol } = require("electron");
let log = require("electron-log");

log.initialize();
log.transports.file.level = false;

const runId = crypto.randomBytes(4).toString("hex");
const tmp = path.join(os.tmpdir(), `idkr-headless-${runId}`);
const userDataDir = path.join(tmp, "userData");
const documentsDir = path.join(tmp, "documents");
const scriptsDir = path.join(tmp, "scripts");
const swapDir = path.join(tmp, "swap");

for (const dir of [userDataDir, documentsDir, scriptsDir, swapDir, path.join(swapDir, "img")]) fs.mkdirSync(dir, { recursive: true });
app.setPath("userData", userDataDir);
app.setPath("documents", documentsDir);

// Never open a visible window while checking the client
BrowserWindow.prototype.show = function() {};

const Store = require("electron-store");
const config = new Store();
config.set("disableFrameRateLimit", false);
config.set("enableUserscripts", true);
config.set("userscriptsPath", scriptsDir);
config.set("resourceSwapperMode", "normal");
config.set("resourceSwapperPath", swapDir);
config.set("blockAds", true);
config.set("discordRPC", false);
config.set("userscriptTest", "beta");

for (let file of ["game-script.js", "social-script.js"]) {
	fs.copyFileSync(path.join(__dirname, "fixtures", "userscripts", file), path.join(scriptsDir, file));
}

const swapFile = `idkr-swap-${runId}.txt`;
const swapImage = `idkr-swap-${runId}.png`;
const swapContent = "idkr-headless-swap-ok";
fs.writeFileSync(path.join(swapDir, swapFile), swapContent);
fs.writeFileSync(
	path.join(swapDir, "img", swapImage),
	Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64")
);

const BrowserLoader = require("../app/loaders/browser-loader");
const IpcLoader = require("../app/loaders/ipc-loader");
const SwapProtocol = require("../app/modules/swap-protocol");
const AdBlocker = require("../app/modules/adblocker");
const PathUtils = require("../app/utils/path-utils");
const { isRegistered } = require("electron-localshortcut");

protocol.registerSchemesAsPrivileged([{
	scheme: "idkr-swap",
	privileges: { secure: true, corsEnabled: true, supportFetchAPI: true, stream: true }
}]);

app.on("window-all-closed", () => {});
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("mute-audio");

const results = [];
const consoleLines = [];
const loadFailures = [];
const adEvents = { blocked: [], completed: [] };

function check(name, pass, details) {
	results.push({ name, pass: Boolean(pass), details });
	console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
	if (!pass && details !== undefined) console.log("     ", typeof details === "string" ? details : JSON.stringify(details).slice(0, 800));
}

function section(name) {
	console.log(`\n=== ${name} ===`);
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
	await app.whenReady();

	IpcLoader.load(config);
	ipcMain.handle("rpc-activity", () => null);

	BrowserLoader.load(false, config);
	await PathUtils.ensureDirs(BrowserLoader.getSwapDir(), scriptsDir);
	SwapProtocol.register(BrowserLoader.getSwapDir());
	BrowserLoader.installRequestFilters(config);

	session.defaultSession.webRequest.onErrorOccurred(details => {
		if (AdBlocker.isAdUrl(details.url)) adEvents.blocked.push({ url: details.url, error: details.error });
	});
	session.defaultSession.webRequest.onCompleted(details => {
		if (AdBlocker.isAdUrl(details.url)) adEvents.completed.push({ url: details.url, statusCode: details.statusCode });
	});

	let win = BrowserLoader.initWindow("https://krunker.io/", config);
	win.webContents.setBackgroundThrottling(false);
	win.webContents.on("console-message", (event, level, message, line, sourceId) => {
		if (event && typeof event.message === "string") {
			consoleLines.push({ level: event.level, message: event.message, line: event.lineNumber, sourceId: event.sourceId });
		}
		else consoleLines.push({ level, message, line, sourceId });
	});
	win.webContents.on("did-fail-load", (event, code, description, url, isMainFrame) => {
		if (isMainFrame && code !== -3) loadFailures.push({ code, description, url });
	});
	win.webContents.on("render-process-gone", (event, details) => {
		check("renderer stays alive", false, details);
	});

	const loaded = new Promise(resolve => {
		if (win.webContents.isLoading()) win.webContents.once("did-finish-load", () => resolve());
		else resolve();
	});
	await Promise.race([loaded, sleep(45000)]);

	async function evaluate(code) {
		return win.webContents.executeJavaScript(code, true);
	}

	async function waitFor(code, timeout = 45000, description = code) {
		let started = Date.now();
		while (Date.now() - started < timeout) {
			try {
				if (await evaluate(code)) return true;
			}
			catch { /* page is still loading */ }
			await sleep(250);
		}
		console.log(`     timed out waiting for: ${description}`);
		return false;
	}

	section("Game page and client injection");

	const pageReady = await waitFor(
		"!!(window.windows && window.windows[0] && window.windows[0].getCSettings && document.getElementById(\"accManagerBtn\"))",
		60000,
		"client settings and Alt-Manager injection"
	);
	check("game page loads", !loadFailures.length, loadFailures);
	check("window stays hidden", win.isVisible() === false);
	check("client hooks the game", pageReady);
	check("userscripts are loaded", await waitFor("!!window.__idkrTestUserscript", 15000, "test userscript"));

	const page = await evaluate(`(() => {
		const util = Object.keys(window).filter(key => key.length === 10).map(key => {
			try { return window[key]; } catch { return null; }
		}).find(value => value && typeof value.setCSetting === "function" && value.settings && value.settings.blockAds);
		return {
			title: document.title,
			url: location.href,
			offCliV: window.OffCliV,
			accManagerButton: !!document.getElementById("accManagerBtn"),
			prevSibling: document.getElementById("accManagerBtn") && document.getElementById("accManagerBtn").previousElementSibling && document.getElementById("accManagerBtn").previousElementSibling.id,
			utilFound: !!util,
			blockAdsSetting: !!(util && util.settings.blockAds),
			adStyle: !!document.getElementById("idkr-adblock-styles"),
			adContainers: [...document.querySelectorAll('[id^="krunker-io_"], #adCon, #aHider, #topRightAdHolder')].length,
			userscript: window.__idkrTestUserscript || null,
			socialScript: typeof window.__idkrSocialOnlyScript,
			adsbygoogle: typeof window.adsbygoogle
		};
	})()`);

	check("title is Krunker", /Krunker/i.test(page.title || ""), page.title);
	const pageUrl = new URL(page.url);
	check("game URL", pageUrl.hostname === "krunker.io" && pageUrl.pathname === "/", page.url);
	check("OffCliV workaround is set", page.offCliV === true, page.offCliV);
	check("Alt-Manager button injected", page.accManagerButton && page.prevSibling === "customizeButton", page);
	check("client utilities available", page.utilFound);
	check("Block Ads setting available", page.blockAdsSetting);
	check("ad hiding style injected", page.adStyle);
	check("ad containers exist to hide", page.adContainers > 0, page.adContainers);

	check("userscript ran", page.userscript && page.userscript.ran, page.userscript);
	check("userscript received clientUtils", page.userscript && page.userscript.hasUtils, page.userscript);
	check("userscript read saved config", page.userscript && page.userscript.configValue === "beta", page.userscript);
	check("userscript setting applied before load", page.userscript && page.userscript.settingValue === "beta", page.userscript);
	check("social-only userscript skipped on game", page.socialScript === "undefined", page.socialScript);

	section("Ad blocking");

	await sleep(2000);
	const blockedAdHosts = [...new Set(adEvents.blocked.map(entry => new URL(entry.url).hostname))];
	check("ad requests were cancelled", adEvents.blocked.length > 0, blockedAdHosts);
	check("pagead/googlesyndication was blocked", blockedAdHosts.some(host => /googlesyndication|googletagmanager|doubleclick/.test(host)), blockedAdHosts);
	check("no ad request completed", adEvents.completed.length === 0, adEvents.completed.slice(0, 5));
	check("blocked requests hit the client", adEvents.blocked.some(entry => entry.error === "net::ERR_BLOCKED_BY_CLIENT"), adEvents.blocked.slice(0, 5));

	async function syntheticAdRequest(marker) {
		const probe = new BrowserWindow({ width: 400, height: 300, show: false, webPreferences: { backgroundThrottling: false } });
		await probe.loadURL("about:blank");
		const before = adEvents.blocked.length;
		await probe.webContents.executeJavaScript(`new Promise(resolve => {
			const image = new Image();
			image.onload = () => resolve("load");
			image.onerror = () => resolve("error");
			image.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?headless=${marker}";
			setTimeout(() => resolve("timeout"), 6000);
		})`, true);
		await sleep(500);
		probe.destroy();
		return adEvents.blocked.slice(before).filter(entry => entry.url.includes(marker));
	}

	const blockedSynthetic = await syntheticAdRequest(`enabled-${runId}`);
	check("synthetic ad request is blocked", blockedSynthetic.some(entry => entry.error === "net::ERR_BLOCKED_BY_CLIENT"), blockedSynthetic);

	BrowserLoader.adBlocker.setEnabled(false);
	await sleep(200);
	const allowedSynthetic = await syntheticAdRequest(`disabled-${runId}`);
	check("disabling Block Ads allows requests", !allowedSynthetic.some(entry => entry.error === "net::ERR_BLOCKED_BY_CLIENT"), allowedSynthetic);
	BrowserLoader.adBlocker.setEnabled(true);
	await sleep(200);

	section("Settings tab");

	const settings = await evaluate(`(async () => {
		const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
		const waitFor = async (fn, timeout = 10000) => {
			const start = Date.now();
			while (Date.now() - start < timeout) {
				const value = fn();
				if (value) return value;
				await sleep(100);
			}
			throw new Error("timed out");
		};

		const util = Object.keys(window).filter(key => key.length === 10).map(key => {
			try { return window[key]; } catch { return null; }
		}).find(value => value && typeof value.setCSetting === "function" && value.settings && value.settings.blockAds);
		const w = window.windows[0];
		const out = {
			tabsBasic: w.tabs.basic.map(tab => tab.name),
			tabsAdvanced: w.tabs.advanced.map(tab => tab.name),
			userscriptSetting: util.settings.userscriptTest ? { val: util.settings.userscriptTest.val } : null
		};

		w.settingType = "basic";
		w.tabIndex = w.tabs.basic.length - 1;
		const basicHtml = w.getCSettings();
		out.basicLength = basicHtml.length;
		out.basicHasBlockAds = basicHtml.includes("Block Ads");
		out.basicHasUserscript = basicHtml.includes("Test Setting");
		out.basicUserscriptSelectedBeta = /<option value='beta' selected>/.test(basicHtml);

		w.tabIndex = 0;
		out.wrongTabLength = w.getCSettings().length;

		w.settingSearch = "alt-manager";
		const searchHtml = w.getCSettings();
		out.searchHasAltManager = searchHtml.includes("Show Alt-Manager Button");
		out.searchHasChromium = searchHtml.includes("Chromium Flags");
		w.settingSearch = null;

		w.settingType = "advanced";
		w.tabIndex = w.tabs.advanced.length - 1;
		out.advancedLength = w.getCSettings().length;

		w.settingType = "basic";
		w.tabIndex = w.tabs.basic.length - 1;

		const nav = [...document.querySelectorAll(".nav-label")].find(element => element.innerText.trim().toLowerCase() === "settings");
		(nav.closest(".nav-item") || nav).click();
		await waitFor(() => document.getElementById("windowHeader") && /Game Settings/.test(document.getElementById("windowHeader").innerText), 15000);

		const clientTab = [...document.querySelectorAll(".settingTab")].find(element => element.innerText.trim() === "idkr-v");
		out.clientTab = !!clientTab;
		if (clientTab) clientTab.click();
		await waitFor(() => [...document.querySelectorAll(".setHed")].some(element => /Performance/.test(element.innerText)), 15000);

		out.heads = [...document.querySelectorAll(".setHed")].map(element => element.innerText);
		const noSettings = [...document.querySelectorAll(".setHed")].find(element => /No settings found/.test(element.innerText));
		out.noSettingsHidden = noSettings ? getComputedStyle(noSettings).display === "none" : true;
		out.renderedBlockAds = [...document.querySelectorAll(".settName")].some(element => /Block Ads/.test(element.innerText));
		out.renderedAltManagerButton = [...document.querySelectorAll(".settName")].some(element => /Show Alt-Manager Button/.test(element.innerText));
		const userscriptRow = [...document.querySelectorAll(".settName")].find(element => /Test Setting/.test(element.innerText));
		out.userscriptRow = !!userscriptRow;
		out.userscriptSelected = userscriptRow && userscriptRow.querySelector("select") ? userscriptRow.querySelector("select").value : null;

		const blockAdsCheckbox = document.querySelector("input[onclick*='blockAds']");
		out.blockAdsChecked = blockAdsCheckbox ? blockAdsCheckbox.checked : null;
		blockAdsCheckbox.click();
		await sleep(400);
		out.blockAdsOff = { checked: blockAdsCheckbox.checked, style: !!document.getElementById("idkr-adblock-styles") };
		blockAdsCheckbox.click();
		await sleep(400);
		out.blockAdsOn = { checked: blockAdsCheckbox.checked, style: !!document.getElementById("idkr-adblock-styles") };

		const altCheckbox = document.querySelector("input[onclick*='showAltManagerButton']");
		altCheckbox.click();
		await sleep(100);
		out.altOffDisplay = getComputedStyle(document.getElementById("accManagerBtn")).display;
		altCheckbox.click();
		await sleep(100);
		out.altOnDisplay = getComputedStyle(document.getElementById("accManagerBtn")).display;

		const closer = document.getElementById("windowCloser");
		if (closer) closer.click();
		return out;
	})()`);

	await sleep(500);

	check("idkr-v basic tab exists", settings.tabsBasic.includes("idkr-v"), settings.tabsBasic);
	check("idkr-v advanced tab exists", settings.tabsAdvanced.includes("idkr-v"), settings.tabsAdvanced);
	check("client settings HTML is generated", settings.basicLength > 1000 && settings.basicHasBlockAds, settings.basicLength);
	check("client settings stay on their tab", settings.wrongTabLength === 0, settings.wrongTabLength);
	check("settings search filters entries", settings.searchHasAltManager && !settings.searchHasChromium, settings);
	check("advanced client settings HTML is generated", settings.advancedLength > 0, settings.advancedLength);
	check("idkr-v tab is rendered", settings.clientTab);
	check("client categories render in the settings popup", ["Performance", "Chromium", "Interface", "Discord", "Maintenance"].every(name => settings.heads.some(head => head.includes(name))), settings.heads);
	check("No settings found placeholder is hidden", settings.noSettingsHidden);
	check("Block Ads control renders", settings.renderedBlockAds);
	check("Alt-Manager visibility control renders", settings.renderedAltManagerButton);
	check("userscript setting renders", settings.userscriptRow && settings.userscriptSelected === "beta", settings);
	check("userscript setting from config is applied", settings.userscriptSetting && settings.userscriptSetting.val === "beta", settings.userscriptSetting);
	check("Block Ads starts enabled", settings.blockAdsChecked === true, settings.blockAdsChecked);
	check("Block Ads toggles the style off", settings.blockAdsOff && settings.blockAdsOff.checked === false && settings.blockAdsOff.style === false, settings.blockAdsOff);
	check("Block Ads toggles the style on", settings.blockAdsOn && settings.blockAdsOn.checked === true && settings.blockAdsOn.style === true, settings.blockAdsOn);
	await evaluate(`(() => {
		const util = Object.keys(window).filter(key => key.length === 10).map(key => {
			try { return window[key]; } catch { return null; }
		}).find(value => value && typeof value.setCSetting === "function" && value.settings && value.settings.blockAds);
		util.setCSetting("blockAds", false);
	})()`);
	await sleep(400);
	check("Block Ads off reaches the main process", BrowserLoader.adBlocker.isEnabled() === false, BrowserLoader.adBlocker.isEnabled());
	await evaluate(`(() => {
		const util = Object.keys(window).filter(key => key.length === 10).map(key => {
			try { return window[key]; } catch { return null; }
		}).find(value => value && typeof value.setCSetting === "function" && value.settings && value.settings.blockAds);
		util.setCSetting("blockAds", true);
	})()`);
	await sleep(400);
	check("Block Ads on reaches the main process", BrowserLoader.adBlocker.isEnabled() === true, BrowserLoader.adBlocker.isEnabled());
	check("Show Alt-Manager Button hides the button", settings.altOffDisplay === "none", settings.altOffDisplay);
	check("Show Alt-Manager Button restores the button", settings.altOnDisplay === "block", settings.altOnDisplay);

	section("Alt-Manager");

	const alt = await evaluate(`(async () => {
		const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
		const waitFor = async (fn, timeout = 15000) => {
			const start = Date.now();
			while (Date.now() - start < timeout) {
				const value = fn();
				if (value) return value;
				await sleep(100);
			}
			throw new Error("timed out");
		};

		const out = { alerts: [], submitted: [] };
		window.alert = message => out.alerts.push(String(message));
		window.confirm = () => true;
		HTMLFormElement.prototype.requestSubmit = function() {
			out.submitted.push({
				id: this.id,
				fields: [...this.querySelectorAll("input")].map(input => ({
					id: input.id,
					type: input.type,
					value: input.value
				}))
			});
		};

		const openManager = async expected => {
			document.getElementById("accManagerBtn").click();
			await waitFor(() => document.querySelectorAll(".altlistelement").length === expected);
		};

		openManager(0);
		out.managerShown = getComputedStyle(document.getElementById("idkr-windowHolder")).display !== "none";

		const addAccount = async (name, password, expected) => {
			document.getElementById("altAdd").click();
			await waitFor(() => document.getElementById("idkrAccName"));
			document.getElementById("idkrAccName").value = name;
			document.getElementById("idkrAccPass").value = password;
			document.getElementById("addAccountButtonB").click();
			await waitFor(() => document.querySelectorAll(".altlistelement").length === expected);
		};

		await addAccount("headless@example.com", "email-password", 1);
		await addAccount("headless-user", "user-password", 2);

		const stored = JSON.parse(localStorage.getItem("altAccounts"));
		out.stored = stored.map(entry => ({ username: entry.username, format: entry.format, password: atob(String(entry.password)) }));
		out.listed = [...document.querySelectorAll(".altlistelement")].map(element => element.innerText);

		document.querySelectorAll(".altlistelement")[0].click();
		await waitFor(() => out.submitted.length === 1);
		out.emailSubmit = out.submitted[0];

		await openManager(2);
		document.querySelectorAll(".altlistelement")[1].click();
		await waitFor(() => out.submitted.length === 2);
		out.usernameSubmit = out.submitted[1];

		await openManager(2);
		document.querySelectorAll(".altdeletebtn")[0].click();
		await waitFor(() => document.querySelectorAll(".altlistelement").length === 1);
		out.afterDelete = {
			stored: JSON.parse(localStorage.getItem("altAccounts")).map(entry => entry.username),
			listed: [...document.querySelectorAll(".altlistelement")].map(element => element.innerText)
		};

		const closer = document.getElementById("windowCloser");
		if (closer) closer.click();
		return out;
	})()`);

	check("Alt-Manager opens from the menu button", alt.managerShown);
	check("Alt-Manager stores accounts", alt.stored.length === 2, alt.stored);
	check("Alt-Manager base64-encodes passwords", alt.stored[0].format === "b64" && alt.stored[0].password === "email-password", alt.stored);
	check("Alt-Manager lists accounts", alt.listed.length === 2, alt.listed);
	check("email account fills the email form", alt.emailSubmit && alt.emailSubmit.fields.some(field => field.id === "accEmail" && field.value === "headless@example.com") && alt.emailSubmit.fields.some(field => field.id === "accPass" && field.value === "email-password"), alt.emailSubmit);
	check("username account fills the username form", alt.usernameSubmit && alt.usernameSubmit.fields.some(field => field.id === "accName" && field.value === "headless-user") && alt.usernameSubmit.fields.some(field => field.id === "accPass" && field.value === "user-password"), alt.usernameSubmit);
	check("Alt-Manager deletes accounts", alt.afterDelete.stored.length === 1 && alt.afterDelete.listed.length === 1, alt.afterDelete);
	check("no Alt-Manager alerts", alt.alerts.length === 0, alt.alerts);

	section("Resource swapper");

	const swap = await evaluate(`(async () => {
		const out = {};
		out.file = await fetch("https://krunker.io/${swapFile}?headless=" + Date.now(), { cache: "no-store" }).then(response => response.text()).catch(error => "ERR:" + error.message);
		out.image = await new Promise(resolve => {
			const image = new Image();
			image.onload = () => resolve({ loaded: true, width: image.naturalWidth });
			image.onerror = () => resolve({ loaded: false });
			image.src = "https://assets.krunker.io/img/${swapImage}?headless=" + Date.now();
			setTimeout(() => resolve({ timeout: true }), 8000);
		});
		out.miss = await fetch("https://krunker.io/idkr-not-swapped-${runId}.txt?headless=" + Date.now(), { cache: "no-store" }).then(response => response.text()).catch(error => "ERR:" + error.message);
		return out;
	})()`);

	check("normal swapper serves krunker.io files", swap.file === swapContent, swap.file);
	check("normal swapper serves img files on the asset host", swap.image && swap.image.loaded && swap.image.width === 1, swap.image);
	check("swapper does not redirect unlisted paths", swap.miss !== swapContent, swap.miss);

	section("Window setup");

	for (const accelerator of ["F5", "F11", "F12", "Control+Shift+I", "CommandOrControl+L", "CommandOrControl+Shift+N", "Control+Alt+R", "F6"]) {
		check(`shortcut ${accelerator} is registered`, isRegistered(win, accelerator) === true);
	}
	check("no extra visible windows were opened", BrowserWindow.getAllWindows().every(window => !window.isVisible()));

	const clientErrors = consoleLines.filter(line => {
		let message = String(line.message || "");
		let source = String(line.sourceId || "");
		if (/electron-log isn't initialized|__ELECTRON_LOG__/.test(message)) return false;
		return /\[idkr\]/.test(message) && !/Executing userscript|Blocked Script/.test(message)
			|| (/Uncaught|ReferenceError|TypeError/.test(message) && /app[\\/](preload|modules|exports)/.test(source));
	});
	check("no client script errors", clientErrors.length === 0, clientErrors.slice(0, 5));

	fs.writeFileSync(path.join(tmp, "result.json"), JSON.stringify({
		results,
		consoleLines,
		loadFailures,
		adEvents,
		settings,
		alt,
		swap
	}, null, 2));

	const failed = results.filter(result => !result.pass);
	console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
	if (failed.length) {
		console.log(`Artifacts: ${tmp}`);
		app.exit(1);
	}
	else {
		win.destroy();
		for (const window of BrowserWindow.getAllWindows()) window.destroy();
		await sleep(500);
		try {
			fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		}
		catch (err) {
			console.warn(`Could not remove test artifacts: ${tmp} (${err.code})`);
		}
		app.exit(0);
	}
}

main().catch(error => {
	console.error(error);
	console.error("Recent renderer console messages:");
	for (const line of consoleLines.slice(-20)) console.error(` [${line.level}] ${line.message}`);
	check("headless run completed", false, String(error && error.stack || error));
	app.exit(1);
});

setTimeout(() => {
	console.error("Headless run timed out");
	app.exit(1);
}, 180000).unref();
