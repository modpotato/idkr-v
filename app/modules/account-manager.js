"use strict";

/**
 * @typedef {HTMLInputElement} inputs
 * @typedef {Window & any} window
 */

/* eslint-disable no-alert */

let WindowManager = require("./window-manager");

const HTML = {
	BTN_INNER: '<div id="accManagerBtn" class="button buttonB bigShadowT" onmouseenter="playTick()" style="display:block;width:300px;text-align:center;padding:15px;font-size:23px;pointer-events:all;padding-bottom:22px;margin-left:-5px;margin-top:5px">Alt-Manager</div>',
	ALT_MENU: '<div id="altAccounts"></div><div id="buttons"><div class="accountButton" id="altAdd">Add new account</div></div>',
	FORM: '<input id="idkrAccName" type="text" placeholder="Enter Username or Email" class="accountInput" style="margin-top:25px;" value=""><input id="idkrAccPass" type="password" placeholder="Enter Password" class="accountInput"><div id="accResp" style="margin-top:10px;font-size:18px;color:rgba(0,0,0,0.5);"><span style="color:rgba(0,0,0,0.8)"></span></div><div class="accountButton" id="addAccountButtonB" style="">Add Account</div></div></div>',
	STYLE: "#altAdd,#addAccountButtonB{width:100%; color:white}.accountButton{box-sizing:border-box;margin-top:10px;padding:10px 15px;text-align:center;cursor:pointer;background-color:#2e9e4a;border-radius:4px;box-shadow:inset 0 -7px 0 0 #1f6e32}.accountButton:hover{filter:brightness(1.15)}.altAccountsLISTED{margin-right:10px;padding:0!important;background:0 0!important;box-shadow:unset!important; height:auto}.altdeletebtn{display:inline-block;padding:10px 13px;color:#fff;background-color:#ff4747;border-radius:0 4px 4px 0;box-shadow:inset 0 -7px 0 0 #992b2b}.altlistelement{display:inline-block;padding:10px 15px 10px 17px;color:#fff;background-color:#ffc147;border-radius:4px 0 0 4px;box-shadow:inset 0 -7px 0 0 #b08531}.deleteColor{color:#000!important;background-color:#313131!important}"
};

/**
 * Creates a new instance of the AccountManager.
 * This class should not be used anywhere else
 * other than the single instance in app/preload/game.js
 *
 * @class AccountManager
 */
class AccountManager {
	/**
	 * Creates an instance of AccountManager.
	 *
	 * @memberof AccountManager
	 */
	constructor() {
		this.managerWin = new WindowManager("accManagerBtn");
		this.addWin = new WindowManager("altAdd");

		!localStorage.getItem("altAccounts") && localStorage.setItem("altAccounts", "[]");
	}

	/**
	 * Add account to local list
	 *
	 * @private
	 * @param {string} name
	 * @param {string} pass
	 * @returns {void}
	 * @memberof AccountManager
	 */
	#addAccount = (name, pass) => {
		if (name.replace(/\s/, "") === "" || pass.replace(/\s/, "") === "") return alert("Username and Password fields must not be empty.");
		let users = JSON.parse(localStorage.getItem("altAccounts"));
		if (users.find(e => e.username === name)) return alert("This Username has already been added.");
		localStorage.setItem("altAccounts", JSON.stringify(
			[].concat(users, {
				username: name,
				format: "b64",
				password: Buffer.from(String(pass)).toString("base64")
			})
		));
		this.addWin.hide();
		return this.#openPopup();
	};

	/**
	 * Delete account from local list
	 *
	 * @private
	 * @param {string} name
	 * @memberof AccountManager
	 */
	#deleteAccount = (name) => {
		localStorage.setItem("altAccounts", JSON.stringify(
			JSON.parse(localStorage.getItem("altAccounts")).filter(e => e.username !== name)
		));
		this.managerWin.hide();
		this.#openPopup();
	};

	/**
	 * Wait until a getter returns something truthy
	 *
	 * @private
	 * @template T
	 * @param {() => T} getter
	 * @param {number} [timeout=5000]
	 * @returns {Promise<T>}
	 * @memberof AccountManager
	 */
	#waitFor = (getter, timeout = 5000) => new Promise((resolve, reject) => {
		let start = Date.now();
		let check = () => {
			let value = getter();
			if (value) resolve(value);
			else if (Date.now() - start > timeout) reject(new Error("Timed out waiting for the login form"));
			else setTimeout(check, 50);
		};
		check();
	});

	/**
	 * Set the value of an input in a way that the game's (Svelte) form notices
	 *
	 * @private
	 * @param {inputs} input
	 * @param {string} value
	 * @memberof AccountManager
	 */
	#setInputValue = (input, value) => {
		input.value = value;
		input.dispatchEvent(new Event("input", { bubbles: true }));
	};

	/**
	 * Simulate login by filling in and submitting the game's login form.
	 * The form has either an email or a username field, depending on a toggle.
	 *
	 * @private
	 * @param {string} name - username or email
	 * @param {string} pass
	 * @returns {Promise<void>}
	 * @memberof AccountManager
	 */
	#login = async(name, pass) => {
		try {
			let nameInputSelector = name.includes("@") ? "#accEmail" : "#accName";

			// The game keeps login forms it showed earlier in the DOM (hidden), so only use the one on top
			let getForm = () => [...document.querySelectorAll("form")].reverse()
				.find(form => form.querySelector("#accPass") && form.getClientRects().length > 0);

			/** @type {window} */ (window).logoutAcc();
			/** @type {window} */ (window).loginOrRegister();

			await this.#waitFor(getForm);
			if (!getForm().querySelector(nameInputSelector)) {
				// The form shows the other kind of field, so switch it
				/** @type {HTMLElement} */
				let toggle = (await this.#waitFor(() => [...getForm().querySelectorAll(".auth-toggle-btn")]
					.find(btn => /use (username|email) instead/i.test(/** @type {HTMLElement} */ (btn).innerText))));
				toggle.click();
			}

			/** @type {inputs} */
			let nameInput = (await this.#waitFor(() => getForm().querySelector(nameInputSelector)));
			this.#setInputValue(nameInput, name);
			this.#setInputValue(getForm().querySelector("#accPass"), pass);
			getForm().requestSubmit();
		}
		catch (err) {
			console.error("[idkr] Alt-Manager login failed", err);
			alert("Could not log in automatically: " + err.message);
		}
	};

	/**
	 * Open popup dialog
	 *
	 * @private
	 * @memberof AccountManager
	 */
	#openPopup = () => {
		this.managerWin.setContent(HTML.ALT_MENU);
		this.managerWin.toggle();
		this.#watcher();
	};

	/**
	 * Watch for alt-manager button changes
	 *
	 * @private
	 * @memberof AccountManager
	 */
	#watcher = () => {
		let storage = JSON.parse(localStorage.getItem("altAccounts"));

		document.getElementById("altAdd").addEventListener("click", () => {
			this.managerWin.hide();
			this.addWin.setContent(HTML.FORM);
			this.addWin.show();
			document.getElementById("addAccountButtonB").addEventListener("click", () => (
				this.#addAccount(
					/** @type {inputs} */(document.getElementById("idkrAccName")).value,
					/** @type {inputs} */(document.getElementById("idkrAccPass")).value
				)
			));
		});

		storage.forEach(e => {
			const div = document.createElement("div");
			div.innerHTML = `<span class="altlistelement" onmouseenter="playTick()">${e.username}</span><span class="altdeletebtn" onmouseenter="playTick()">X</span>`;
			div.className = "button altAccountsLISTED";
			document.getElementById("altAccounts").appendChild(div);
		});

		document.querySelectorAll(".altlistelement").forEach(i => i.addEventListener("click", (e) => {
			let selected = storage.find(obj => obj.username === /** @type {inputs} */ (e.target).innerText);
			this.#login(
				selected.username,
				(!!selected.format && selected.format === "b64")
					? Buffer.from(String(selected.password), "base64").toString("ascii")
					: selected.password
			);
			this.managerWin.hide();
		}));

		document.querySelectorAll(".altdeletebtn").forEach(i => i.addEventListener("click", (e) => {
			// @ts-ignore
			let tar = e.target.previousElementSibling.innerText;
			confirm(`Do you really want to remove the account "${tar}" from the Alt-Manager?`) && this.#deleteAccount(tar);
		}));
	};

	/**
	 * Initial injection of styles
	 *
	 * @public
	 * @memberof AccountManager
	 */
	injectStyles() {
		document.head.appendChild(Object.assign(document.createElement("style"), { innerText: HTML.STYLE }));
		let tar = document.getElementById("customizeButton");

		let tmp = document.createElement("div");
		tmp.innerHTML = HTML.BTN_INNER.trim();

		tar.parentNode.insertBefore(tmp.firstChild, tar.nextSibling);
		document.getElementById("accManagerBtn").addEventListener("click", () => this.#openPopup());
	}
}

module.exports = AccountManager;
