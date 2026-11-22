/**
 * GatePass - one command starter
 *  1. Starts a local Hardhat blockchain (http://127.0.0.1:8545)
 *  2. Deploys the GatePass smart contract and registers demo users
 *  3. Starts the website at http://localhost:3000
 */
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC_PORT = 8545;
const WEB_PORT = process.env.PORT || 3000;
const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;
const FRONTEND = path.join(__dirname, "frontend");

let hardhat = null;

function rpcAlive() {
  return new Promise((resolve) => {
    const req = http.request(RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" } }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on("error", () => resolve(false));
    req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }));
  });
}

async function startBlockchain() {
  if (await rpcAlive()) {
    console.log("> Blockchain already running on port 8545, using it.");
    return;
  }
  console.log("> Starting local Hardhat blockchain...");
  hardhat = spawn("npx", ["hardhat", "node", "--hostname", "127.0.0.1", "--port", String(RPC_PORT)], {
    cwd: __dirname,
    shell: true,
    windowsHide: true,
    env: { ...process.env, HARDHAT_DISABLE_TELEMETRY_PROMPT: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  hardhat.stdout.on("data", () => {});
  hardhat.stderr.on("data", (d) => process.stderr.write("[hardhat] " + d));
  for (let i = 0; i < 90; i++) {
    if (await rpcAlive()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Hardhat node did not start. Try running: npx hardhat node");
}

async function deploy() {
  const provider = new ethers.JsonRpcProvider(RPC_URL, undefined, { staticNetwork: ethers.Network.from(31337) });
  const accounts = await provider.listAccounts();
  const artifact = JSON.parse(fs.readFileSync(path.join(__dirname, "artifacts", "GatePass.json"), "utf8"));

  console.log("> Deploying GatePass smart contract...");
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, accounts[0]);
  const c = await factory.deploy();
  await c.waitForDeployment();
  const address = await c.getAddress();
  console.log("  Contract address:", address);

  // demo users (registered on the blockchain by the admin)
  await (await c.addWarden(accounts[1].address, "Dr. Sunita Rao (Chief Warden)")).wait();
  await (await c.addGuard(accounts[2].address, "Ramesh Kumar (Main Gate Security)")).wait();
  const demoStudents = [
    [accounts[3].address, "Rahul Verma", "23100BTCSAII10101", "B-204", "Mr. Suresh Verma"],
    [accounts[4].address, "Priya Singh", "23100BTCSAII10102", "G-112", "Mrs. Kavita Singh"],
    [accounts[5].address, "Aman Joshi", "23100BTCSAII10103", "B-118", "Mr. Rajesh Joshi"],
  ];
  for (const s of demoStudents) await (await c.addStudent(...s)).wait();
  console.log("  Demo users registered (1 warden, 1 guard, 3 students).");

  const wallets = accounts.slice(0, 9).map((a) => a.address);
  fs.writeFileSync(path.join(FRONTEND, "config.json"),
    JSON.stringify({ address, abi: artifact.abi, chainId: 31337, wallets }, null, 1));
}

// ---------------- helpers ----------------
function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { reject(new Error("Request too large")); req.destroy(); }
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const MIME = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css", ".json": "application/json",
  ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function startWeb() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    // the website talks to the blockchain through this proxy
    if (url.pathname.startsWith("/rpc")) {
      const body = await readBody(req).catch(() => Buffer.alloc(0));
      const p = http.request(RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" } }, (r) => {
        res.writeHead(r.statusCode, { "Content-Type": "application/json" });
        r.pipe(res);
      });
      p.on("error", () => { res.writeHead(502); res.end("blockchain not reachable"); });
      return p.end(body);
    }

    let file = decodeURIComponent(url.pathname);
    if (file === "/") file = "/index.html";
    const full = path.join(FRONTEND, path.normalize(file));
    if (!full.startsWith(FRONTEND) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      res.writeHead(404); return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(full).pipe(res);
  });
  server.listen(WEB_PORT, "0.0.0.0", () => {
    console.log("\n==============================================");
    console.log("  GatePass is running!");
    console.log(`  Open in browser:  http://localhost:${WEB_PORT}`);
    console.log("  (Keep this window open. Press Ctrl+C to stop)");
    console.log("==============================================\n");
  });
}

(async () => {
  try {
    await startBlockchain();
    await deploy();
    startWeb();
  } catch (e) {
    console.error("ERROR:", e.message);
    if (hardhat) hardhat.kill();
    process.exit(1);
  }
})();
