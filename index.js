const axios = require('axios');
const chalk = require('chalk');
const WebSocket = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');
const readline = require('readline');
const accounts = require('./account.js');
const proxies = require('./proxy.js');
const { useProxy } = require('./config.js');

// Parse accounts to extract email and password
const parsedAccounts = accounts.map(account => {
  const [email, password] = account.split(',');
  return { email, password };
});


let sockets = [];
let pingIntervals = [];
let countdownIntervals = [];
let potentialPoints = [];
let countdowns = [];
let pointsTotals = [];
let pointsToday = [];
let lastUpdateds = [];
let messages = [];
let userIds = [];

const authorization = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlra25uZ3JneHV4Z2pocGxicGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU0MzgxNTAsImV4cCI6MjA0MTAxNDE1MH0.DRAvf8nH1ojnJBc3rD_Nw6t1AV8X_g6gmY_HByG2Mag";
const apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlra25uZ3JneHV4Z2pocGxicGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU0MzgxNTAsImV4cCI6MjA0MTAxNDE1MH0.DRAvf8nH1ojnJBc3rD_Nw6t1AV8X_g6gmY_HByG2Mag";

function displayHeader() {
  console.log("");
  console.log(chalk.yellow(" ============================================"));
  console.log(chalk.yellow("|                 Teneo Bot                  |"));
  console.log(chalk.yellow("|         github.com/ByteBeggar              |"));
  console.log(chalk.yellow(" ============================================"));
  console.log(""); // Empty line for spacing
}

function displayAccountData(index) {
  console.log(chalk.cyan(`============= Account ${index + 1} =============`));
  console.log(chalk.whiteBright(`📧 Email: ${parsedAccounts[index].email}`));
  console.log(chalk.white(`🆔 User ID: ${userIds[index]}`));
  console.log(chalk.green(`💰 Points Total: ${pointsTotals[index] || 0}`));
  console.log(chalk.green(`📅 Points Today: ${pointsToday[index] || 0}`));
  console.log(chalk.whiteBright(`💬 Message: ${messages[index] || "No message"}`));
  
  const proxy = proxies[index];
  if (useProxy && proxy) {
    console.log(chalk.hex('#FFA500')(`🌐 Proxy: ${proxy}`));
  } else {
    console.log(chalk.red('🔌 No Proxy'));
  }

  console.log(chalk.cyan("=========================================="));
}




function logAllAccounts() {
  console.clear();
  displayHeader();
  for (let i = 0; i < accounts.length; i++) {
    displayAccountData(i);
  }
  console.log("\nStatus:");
  for (let i = 0; i < accounts.length; i++) {
    console.log(`Account ${i + 1}: Potential Points: ${potentialPoints[i]}, Countdown: ${countdowns[i]}`);
  }
}

async function connectWebSocket(index) {
  if (sockets[index]) return;
  const version = "v0.2";
  const url = "wss://secure.ws.teneo.pro";
  const wsUrl = `${url}/websocket?userId=${encodeURIComponent(userIds[index])}&version=${encodeURIComponent(version)}`;

  const proxy = proxies[index % proxies.length];
  const agent = useProxy ? new HttpsProxyAgent(`http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`) : null;

  sockets[index] = new WebSocket(wsUrl, { agent });

  sockets[index].onopen = async () => {
    lastUpdateds[index] = new Date().toISOString();
    console.log(`Account ${index + 1} Connected`, lastUpdateds[index]);
    startPinging(index);
    startCountdownAndPoints(index);
  };

  sockets[index].onmessage = async (event) => {
  const data = JSON.parse(event.data);
  if (data.pointsTotal !== undefined && data.pointsToday !== undefined) {
    lastUpdateds[index] = new Date().toISOString();
    pointsTotals[index] = data.pointsTotal; // Update points total
    pointsToday[index] = data.pointsToday;  // Update points today
    messages[index] = data.message || "No new message";

    logAllAccounts(); // Refresh account display with updated points
  }

  if (data.message === "Pulse from server") {
    console.log(`Pulse from server received for Account ${index + 1}. Start pinging...`);
    setTimeout(() => {
      startPinging(index)
    }, 10000);
  }
};


  sockets[index].onclose = () => {
    sockets[index] = null;
    console.log(`Account ${index + 1} Disconnected`);
    restartAccountProcess(index);
  };

  sockets[index].onerror = (error) => {
    console.error(`WebSocket error for Account ${index + 1}:`, error);
  };
}

function disconnectWebSocket(index) {
  if (sockets[index]) {
    sockets[index].close();
    sockets[index] = null;
    restartAccountProcess(index);
  }
}

function startPinging(index) {
  pingIntervals[index] = setInterval(async () => {
    if (sockets[index] && sockets[index].readyState === WebSocket.OPEN) {
      const proxy = proxies[index % proxies.length];
      const agent = useProxy ? new HttpsProxyAgent(`http://${proxy.username}:${proxy.password}@${proxy.host}:${proxy.port}`) : null;
      
      sockets[index].send(JSON.stringify({ type: "PING" }), { agent });
      logAllAccounts();
    }
  }, 10000);
}

function stopPinging(index) {
  if (pingIntervals[index]) {
    clearInterval(pingIntervals[index]);
    pingIntervals[index] = null;
  }
}

process.on('SIGINT', () => {
  console.log('Stopping...');
  for (let i = 0; i < accounts.length; i++) {
    stopPinging(i);
    disconnectWebSocket(i);
  }
  process.exit(0);
});

function startCountdownAndPoints(index) {
  clearInterval(countdownIntervals[index]);
  updateCountdownAndPoints(index);
  countdownIntervals[index] = setInterval(() => updateCountdownAndPoints(index), 1000);
}

async function updateCountdownAndPoints(index) {
  const restartThreshold = 60000;
  const now = new Date();

  if (!lastUpdateds[index]) {
    lastUpdateds[index] = {};
  }

  if (countdowns[index] === "Calculating...") {
    const lastCalculatingTime = lastUpdateds[index].calculatingTime || now;
    const calculatingDuration = now.getTime() - lastCalculatingTime.getTime();

    if (calculatingDuration > restartThreshold) {
      restartAccountProcess(index);
      return;
    }
  }

  if (lastUpdateds[index]) {
    const nextHeartbeat = new Date(lastUpdateds[index]);
    nextHeartbeat.setMinutes(nextHeartbeat.getMinutes() + 15);
    const diff = nextHeartbeat.getTime() - now.getTime();

    if (diff > 0) {
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      countdowns[index] = `${minutes}m ${seconds}s`;

      const maxPoints = 25;
      const timeElapsed = now.getTime() - new Date(lastUpdateds[index]).getTime();
      const timeElapsedMinutes = timeElapsed / (60 * 1000);
      let newPoints = Math.min(maxPoints, (timeElapsedMinutes / 15) * maxPoints);
      newPoints = parseFloat(newPoints.toFixed(2));

      if (Math.random() < 0.1) {
        const bonus = Math.random() * 2;
        newPoints = Math.min(maxPoints, newPoints + bonus);
        newPoints = parseFloat(newPoints.toFixed(2));
      }

      potentialPoints[index] = newPoints;
    } else {
      countdowns[index] = "Calculating...";
      potentialPoints[index] = 25;
      lastUpdateds[index].calculatingTime = now;
    }
  } else {
    countdowns[index] = "Calculating...";
    potentialPoints[index] = 0;
    lastUpdateds[index].calculatingTime = now;
  }

  logAllAccounts();
}

function restartAccountProcess(index) {
  disconnectWebSocket(index);
  connectWebSocket(index);
  console.log(`WebSocket restarted for index: ${index}`);
}

async function getUserId(index) {
  const loginUrl = "https://ikknngrgxuxgjhplbpey.supabase.co/auth/v1/token?grant_type=password";
  const proxy = proxies[index];
  const agent = useProxy && proxy ? new HttpsProxyAgent(proxy) : null;

  // Debugging line: Ensure email and password are being correctly parsed
  console.log(`Attempting to login with Email: ${parsedAccounts[index].email}, Password: ${parsedAccounts[index].password}`);
  
  try {
    const response = await axios.post(loginUrl, {
      email: parsedAccounts[index].email,
      password: parsedAccounts[index].password
    }, {
      headers: {
        'Authorization': authorization,
        'apikey': apikey
      },
      httpsAgent: agent
    });

    userIds[index] = response.data.user.id;
    logAllAccounts();

    startCountdownAndPoints(index);
    await connectWebSocket(index);
  } catch (error) {
    console.error(`Error for Account ${index + 1}:`, error.response ? error.response.data : error.message);
  }
}



displayHeader();

for (let i = 0; i < accounts.length; i++) {
  potentialPoints[i] = 0;
  countdowns[i] = "Calculating...";
    pointsToday[i] = 0;
    lastUpdateds[i] = null;
    messages[i] = '';
    userIds[i] = null;
    getUserId(i);
}
