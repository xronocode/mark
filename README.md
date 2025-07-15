# marktext v0.18

## 1. What Is This? Yet another fork of Marktext?

- Well yes, you indeed got that correct 🤓☝️, this is yet another attempt at modernising the insanely popular but abandoned project of [marktext](https://github.com/marktext/marktext)

- This branch is forked from [jacobwhall's fork which was later abandoned](https://github.com/jacobwhall/marktext) and built ontop of it

  - (The fork already contained a lot of neat bugfixes thank you)

## 2. Soo is this fork any different from the countless others?

- A main gripe I had when looking into `marktext` was that the development framework + environment was aging badly and took forever to compile

  - Most libaries were outdated and some couldn't even be installed with modern versions of Node.JS/Python

- Hence, this fork is kind of a major "re-write" that makes use of [electron-vite](https://electron-vite.org/) instead of the old `Babel + Webpack` setup

  - The goal here is to give `marktext` a **fresh start** using **modern frameworks and libraries as much as possible**
  - Everything has also been migrated to `Vue3` and `Pinia` with all libraries updated to their latest possible versions

- The `main` and `preload` processes are still compiled to `CommonJS`, but the `renderer` is now fully **`ESModules` only** (_which posed some interesting issues during migration_)

## 3. Wow that's cool! So where's the releases?

- Unfortunately, I would highly recommend **against** using this for **production use** for now as I have no idea how many things I might have broken during migration

  - _(I.e: Still in **active development** for now, if you would like to help, see below_)

## 4. That's cool! How can I help?

- Any form of:

  1. Testing for bugs (Bug-Reports)
  2. Pull Requests

  Are more than welcome!

- You can find a basic list of commands for getting around this repo below, but otherwise - the file structure should be **very similar to the original marktext**

## 5. Project Setup

### Pre-Requisites

- Python (`>= 3.12`)

- Node.JS (`>= 22`)

- A lot of patience

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```
