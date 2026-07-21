import { join } from "node:path";
import { hostname } from "node:os";
import { createServer } from "node:http";
import express from "express";
import wisp from "wisp-server-node";

import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const app = express();

// 1. 静的ファイルとUV関連のパス設定
app.use(express.static("./public"));
app.use("/uv/", express.static(uvPath));
app.use("/epoxy/", express.static(epoxyPath));
app.use("/baremux/", express.static(baremuxPath));

// 404エラーハンドリング
app.use((req, res) => {
	res.status(404);
	// Vercel環境用に絶対パスで指定
	res.sendFile(join(process.cwd(), "./public/404.html"));
});

// 2. HTTPサーバーの作成
const server = createServer();

server.on("request", (req, res) => {
	// サイトの再現に必要なセキュリティヘッダーを付与
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
	res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
	app(req, res);
});

// Vercelのサーバーレス環境ではWebSocket(Wisp)のupgradeイベントが制限される場合があるため、
// 通常のHTTPリクエストとしてもWispを処理できるようにルーティングを補強
app.use("/wisp/", (req, res) => {
	if (req.method === "GET" && req.headers.upgrade === "websocket") {
		// WebSocketアップグレード要求は通常通り処理
		return;
	}
	res.status(200).send("Wisp server is running (HTTP Gateway)");
});

server.on("upgrade", (req, socket, head) => {
	if (req.url.endsWith("/wisp/") || req.url.includes("/wisp/?")) {
		wisp.routeRequest(req, socket, head);
		return;
	} 
	socket.end();
});

// 3. 【重要】Vercel用にエクスポート処理を追加
// Vercelは自動でポートを開くため、自前で server.listen() を呼ぶとエラーになります。
// 代わりに、作成したサーバーまたはExpressアプリを外部に公開（エクスポート）します。
export default server;

// ローカル環境（または通常のサーバー環境）でのみ listen を実行する仕様に変更
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
	let port = parseInt(process.env.PORT || "");
	if (isNaN(port)) port = 8080;

	server.listen({ port }, () => {
		const address = server.address();
		console.log(`Listening on: http://localhost:${address.port}`);
	});
}

// 終了処理
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
	console.log("SIGTERM signal received: closing HTTP server");
	server.close();
	process.exit(0);
}
