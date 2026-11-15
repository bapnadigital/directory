/** @jsxImportSource hono/jsx */
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { type AppEnv, sessionMiddleware } from "./auth";
import { type Env, ensureSchema, now } from "./db";
import { importBatch } from "./import";
import { importJtBatch } from "./jt-import";
import { snapshotRates } from "./rates";
import { ratesApp } from "./routes/rates";
import { toolsApp } from "./routes/tools";
import { refreshNews } from "./news";
import { market } from "./routes/market";
import { ads } from "./routes/ads";
import { contact } from "./routes/contact";
import { account } from "./routes/account";
import { admin } from "./routes/admin";
import { pub } from "./routes/public";
import { page } from "./ui";

const app = new Hono<AppEnv>();

app.use("*", secureHeaders({ xFrameOptions: "DENY", referrerPolicy: "strict-origin-when-cross-origin" }));
app.use("*", async (c, next) => { await ensureSchema(c.env); await next(); });
app.use("*", sessionMiddleware);

app.route("/", ratesApp);
app.route("/", toolsApp);
app.route("/", market);
app.route("/", ads);
app.route("/", contact);
app.route("/", pub);
app.route("/", account);
app.route("/admin", admin);

app.notFound((c) => { c.status(404); return page(c, { title: "Page not found", noindex: true }, <main class="wrap narrow center" style="padding-top:80px"><h1>Page not found</h1><p class="muted">That page doesn't exist.</p><a class="btn" href="/directory">Open the directory</a></main>); });
app.onError((err, c) => { console.error(err); return c.text("Something went wrong. Please try again.", 500); });

export default {
  fetch: app.fetch,
  async scheduled(_ev: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      await ensureSchema(env);
      try { await importBatch(env, 8); } catch (e) { console.error("import", e); }
      try { await refreshNews(env); } catch (e) { console.error("news", e); }
      try { await snapshotRates(env); } catch (e) { console.error("rates", e); }
      try { await importJtBatch(env, 4); } catch (e) { console.error("jt import", e); }
      await env.DB.prepare(`DELETE FROM sessions WHERE expires_at < ?`).bind(now()).run();
    })());
  },
} satisfies ExportedHandler<Env>;
