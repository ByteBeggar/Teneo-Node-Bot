# Teneo Bot

## Description
Teneo bot is a simple tool designed to automate the node interaction.

## Features
- **Automated node interaction**

## Prerequisites
- [Node.js](https://nodejs.org/) (version 12 or higher)

## Installation

1. Clone the repository to your local machine:
   ```bash
	git clone https://github.com/ByteBeggar/Teneo-Node-Bot.git
   ```
2. Navigate to the project directory:
	```bash
	cd Teneo-Node-Bot
	```
3. Install the necessary dependencies:
	```bash
	npm install
	```

## Usage

1. Set the `account.js`, `config.js`, and `proxy.js` before running the script. Below is how to set up these files.

2. **Configuration**: Modify the `account.js` file to set your account parameters
   ```javascript
   module.exports = [
       "name1@gmail.com,123456",
       "name2@gmail.com,123456",
       "name3@gmail.com,123456"
       // Add more accounts
   ];

	```
	Modify the `config.js` file if you want to use proxy or not, default is false (not use proxy)
	```
	const useProxy = false; // (set true if want to use proxy, false if not)

	module.exports = {
	useProxy
	};
	```
	Modify and set the `proxy.js` file if you want to use proxy
	```
	module.exports = [
    "http://proxyHost:proxyPort",
    "http://proxyHost:proxyPort",
    "http://proxyHost:proxyPort"
    // Add more proxies
];
	```
3. Run the script:
	```bash
	node index.js
	```


## Note
This script only for testing purpose, using this script might violates ToS and may get your account permanently banned.

Extension link : https://chromewebstore.google.com/detail/teneo-community-node/emcclcoaglgcpoognfiggmhnhgabppkm

My reff code if you want to use :) : 
```bash
wKP36
```
