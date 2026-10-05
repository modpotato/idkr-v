# idkr-v

**idkr vibe** — a Krunker client.

idkr-v is a fork of [idkr](https://github.com/idkr-client/idkr) by Mixaz, NullDev and CreepSore. The original project stopped working on current Krunker, so it was brought up to date by an AI coding agent ([Claude Code](https://claude.com/claude-code)) at the request of the repository owner. That is where the "v" (vibe) comes from.

> **About the AI-assisted part:** the update was tested against the live game in a headless Linux environment (menus, settings, Alt-Manager login form, resource swapper, userscripts, shortcuts, popups, packaged build). Actual matches, Windows and macOS builds were not tested by the agent. If something is off, please [open an issue](https://github.com/modpotato/idkr/issues).

This client aims for:
- Stable behavior and performance
- Advanced customizability (settings and userscripts)
- Constructive to the community (open source; under [AGPL-3.0](LICENSE))

## Supported Platforms
| Platform | File Type |
|-|-|
| Windows (64-bit) | `exe` |
| macOS (x64) | `dmg` |
| Linux (x86_64) | `AppImage` |

Only 64-bit builds are provided, since current versions of Electron (and therefore Chromium) no longer support 32-bit systems.

## Download
[Latest release / changelog](https://github.com/modpotato/idkr/releases/latest)
- [Windows installer](https://github.com/modpotato/idkr/releases/latest/download/idkr-v-setup-win.exe)
- [Windows portable](https://github.com/modpotato/idkr/releases/latest/download/idkr-v-portable-win.exe)
- [macOS portable](https://github.com/modpotato/idkr/releases/latest/download/idkr-v-portable-mac-x64.dmg)
- [Linux portable (x86_64)](https://github.com/modpotato/idkr/releases/latest/download/idkr-v-portable-linux-x86_64.AppImage)

## Features
- **idkr-v settings tab** inside Krunker's own settings: performance and Chromium flags, interface options, Discord, updates, userscripts and the resource swapper.
- **Exit button** in the menu, plus the usual desktop conveniences (reload, new windows, fullscreen, DevTools).
- **Alt-Manager**: store several accounts and switch between them from the menu. It fills in and submits Krunker's login form for you (email or username).
- **Resource swapper**: replace game assets with your own files.
- **Userscripts**: see [Userscripts.md](Userscripts.md).
- **Discord Rich Presence**.

Settings marked with a red `*` in the idkr-v tab need a restart of the client.

## Keyboard shortcuts
| Shortcut | Action |
|-|-|
| `F5` / `Shift+F5` | Reload / reload ignoring the cache |
| `F11` | Toggle fullscreen |
| `F12` or `Ctrl+Shift+I` (`Cmd+Option+I` on macOS) | Open DevTools |
| `Alt+Left` / `Alt+Right` (`Cmd+Left` / `Cmd+Right` on macOS) | Back / forward |
| `Ctrl+N` (`Cmd+N`) | New game window |
| `Ctrl+Shift+N` (`Cmd+Shift+N`) | New window with the current page |
| `F6` | Go back to the main Krunker page (game windows) |
| `Ctrl+L` (`Cmd+L`) | Copy the current URL |
| `Esc` | Release the mouse pointer |
| `Ctrl+Alt+R` (`Cmd+Alt+R`) | Restart the client |
| `Ctrl+Shift+Delete` (`Cmd+Shift+Delete`) | Clear the cache and restart |
| `Shift+F1` | Open the config file |
| `Ctrl+F1` | Reset all client settings and restart |

Command line options: `--debug` (open DevTools), `--update=download|check|skip` (override the auto update behavior) and `--new-window=<url>` (open a Krunker page in a running instance).

## Where things are stored
| What | Location |
|-|-|
| Config (`config.json`) | Linux `~/.config/idkr/`, Windows `%APPDATA%\idkr\`, macOS `~/Library/Application Support/idkr/` |
| Userscripts | `<Documents>/idkr/scripts/` |
| Resource swapper files | `<Documents>/idkr/swap/` |

The folders are still called `idkr` on purpose, so existing settings, scripts and swapped files keep working. Both folders can be changed in the idkr-v settings tab.

## Resource swapper
Put your replacement files into the swap folder, using the same path the game requests them from, and restart the client.

- **Normal mode**: `models/`, `scares/`, `sound/`, `textures/` and `videos/` replace files from `assets.krunker.io`, `img/` replaces files on both `krunker.io` and `assets.krunker.io`, and everything else replaces files from `krunker.io`. For example `swap/textures/recticle.png` replaces `https://assets.krunker.io/textures/recticle.png`.
- **Advanced mode**: start with the hostname instead, e.g. `swap/assets.krunker.io/textures/recticle.png`.

Query strings (like `?build=...`) are ignored when matching.

## Building from source
Requires Node.js 22.12 or newer.

```sh
npm install
npm start          # run the client
npm run startd     # run with DevTools open
npm run pack       # unpacked build into dist/
npm run dist       # installers / portable builds
```

## What changed compared to idkr 1.3.3
- Electron 9 → 44. Current Krunker does not run on the old Chromium (it never got past the loading screen).
- Alt-Manager logs in through Krunker's new login form (the old one no longer exists).
- The resource swapper handles the new `img/` layout and `www.krunker.io` links are recognised.
- The resource swapper's `idkr-swap` protocol only serves files from the swap folder.
- The splash screen no longer hangs when the auto updater is inactive (for example, Linux builds that are not AppImages).
- 64-bit builds only. Auto updates now come from [this repository's releases](https://github.com/modpotato/idkr/releases) instead of the original project's.

## Links and credits
- Original project: [idkr-client/idkr](https://github.com/idkr-client/idkr) (authors: Mixaz, NullDev, CreepSore), its [wiki](https://github.com/idkr-client/idkr/wiki) and [Discord server](https://discord.gg/wEZbFFX). The wiki describes the original client, so it may not match idkr-v exactly.
- idkr-v is not affiliated with the original idkr project, FRVR or Krunker.
- Licensed under [AGPL-3.0](LICENSE).
