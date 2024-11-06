const axios = require('axios');
const WebSocket = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');
const accounts = require('./account.js');
const proxies = require('./proxy.js');
const { useProxy } = require('./config.js');
const blessed = require('blessed');
const contrib = require('blessed-contrib');

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
let pointsTodayArray = [];
let lastUpdateds = [];
let messages = [];
let userIds = [];

const authorization = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlra25uZ3JneHV4Z2pocGxicGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU0MzgxNTAsImV4cCI6MjA0MTAxNDE1MH0.DRAvf8nH1ojnJBc3rD_Nw6t1AV8X_g6gmY_HByG2Mag";
const apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlra25uZ3JneHV4Z2pocGxicGV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjU0MzgxNTAsImV4cCI6MjA0MTAxNDE1MH0.DRAvf8nH1ojnJBc3rD_Nw6t1AV8X_g6gmY_HByG2Mag";

const screen = blessed.screen({
  smartCSR: true,
  title: 'Teneo Bot Dashboard'
});

const table = contrib.table({
  keys: true,
  fg: 'white',
  selectedFg: 'white',
  selectedBg: 'blue',
  interactive: false,
  label: 'Account Status',
  width: '100%',
  height: '90%',
  border: { type: "line", fg: "cyan" },
  columnSpacing: 1,
  columnWidth: [10, 25, 15, 15, 20, 30]
});

screen.append(table);

const log = contrib.log({
  fg: "green",
  selectedFg: "green",
  label: 'Logs',
  height: '10%',
  width: '100%',
  top: '90%'
});

screen.append(log);

function customLog(message) {
  log.log(message);
  screen.render();
}


const pageSize = 20;  
let currentPage = 0;
const pageInfo = blessed.text({
  bottom: 0,
  left: 'center',
  content: `Page ${currentPage + 1} - Use UP/DOWN arrow keys to navigate pages`,
  style: {
    fg: 'white',
    bg: 'black'
  }
});

screen.append(pageInfo);
function updateTable() {
  const data = {
    headers: ['Account', 'Email', 'Points Total', 'Points Today', 'Status', 'Proxy'],
    data: []
  };

  const start = currentPage * pageSize;
  const end = Math.min(start + pageSize, accounts.length);

  for (let i = start; i < end; i++) {
    const email = parsedAccounts[i].email;
    const pointsTotal = pointsTotals[i] || 0;
    const pointsToday = pointsTodayArray[i] || 0;
    const status = countdowns[i] || "Calculating...";
    const proxy = (useProxy && proxies[i % proxies.length]) ? `✔ ${proxies[i % proxies.length]}` : "No Proxy";
    data.data.push([
      String(i + 1),
      email,
      String(pointsTotal),
      String(pointsToday),
      status,
      proxy
    ]);
  }

  table.setData(data);
  screen.render();
}

screen.key(['up', 'down'], (ch, key) => {
  if (key.name === 'up' && currentPage > 0) {
    currentPage--;  
  } else if (key.name === 'down' && (currentPage + 1) * pageSize < accounts.length) {
    currentPage++;  
  }
  updateTable();  
});

updateTable();


setInterval(updateTable, 5000);

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  process.exit(0);
});

async function connectWebSocket(index) {
  if (sockets[index]) return;
  const version = "v0.2";
  const url = "wss://secure.ws.teneo.pro";
  const wsUrl = `${url}/websocket?userId=${encodeURIComponent(userIds[index])}&version=${encodeURIComponent(version)}`;

  let agent = null;
  if (useProxy && proxies.length > 0) {
    const proxyUrl = proxies[index % proxies.length];
    agent = new HttpsProxyAgent(proxyUrl);
  }

  sockets[index] = new WebSocket(wsUrl, { agent });

  sockets[index].onopen = async () => {
    lastUpdateds[index] = new Date().toISOString();
    customLog(`Account ${index + 1} Connected at ${lastUpdateds[index]}`);
    startPinging(index);
    startCountdownAndPoints(index);
  };

  sockets[index].onmessage = async (event) => {
    const data = JSON.parse(event.data);
    if (data.pointsTotal !== undefined && data.pointsToday !== undefined) {
      lastUpdateds[index] = new Date().toISOString();
      pointsTotals[index] = data.pointsTotal;
      pointsTodayArray[index] = data.pointsToday;
      messages[index] = data.message || "No new message";
      updateTable();
    }

    if (data.message === "Pulse from server") {
      customLog(`Pulse from server received for Account ${index + 1}. Start pinging...`);
      setTimeout(() => {
        startPinging(index);
      }, 10000);
    }
  };

  sockets[index].onclose = () => {
    sockets[index] = null;
    customLog(`Account ${index + 1} Disconnected`);
    restartAccountProcess(index);
  };

  sockets[index].onerror = (error) => {
    customLog(`WebSocket error for Account ${index + 1}: ${error.message}`);
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
      let agent = null;
      if (useProxy && proxies.length > 0) {
        const proxyUrl = proxies[index % proxies.length];
        agent = new HttpsProxyAgent(proxyUrl);
      }

      sockets[index].send(JSON.stringify({ type: "PING" }), { agent });
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
  customLog('Stopping...');
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

  updateTable();
}

function restartAccountProcess(index) {
  disconnectWebSocket(index);
  connectWebSocket(index);
  customLog(`WebSocket restarted for index: ${index}`);
}

async function getUserId(index) {
  const loginUrl = "https://ikknngrgxuxgjhplbpey.supabase.co/auth/v1/token?grant_type=password";
  let agent = null;
  if (useProxy && proxies.length > 0) {
    const proxyUrl = proxies[index % proxies.length];
    agent = new HttpsProxyAgent(proxyUrl);
  }

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

    startCountdownAndPoints(index);
    await connectWebSocket(index);
  } catch (error) {
    customLog(`Error for Account ${index + 1}: ${error.response ? error.response.data : error.message}`);
  }
}

for (let i = 0; i < accounts.length; i++) {
  potentialPoints[i] = 0;
  countdowns[i] = "Calculating...";
  pointsTodayArray[i] = 0;
  lastUpdateds[i] = null;
  messages[i] = '';
  userIds[i] = null;
  getUserId(i);
}

updateTable();
