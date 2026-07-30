using System.Threading.Channels;

// ---------------------------------------------------------------------------
// Backend responsibilities (see /README.md for the full architecture story):
//   1. Serve the compiled Vue host app as static files from wwwroot/.
//   2. Serve compiled extension bundles from wwwroot/apps/extensions/<name>/.
//   3. Expose GET /api/extensions — a manifest the host polls/reads once to
//      learn which remoteEntry.js files exist, without either side hardcoding
//      the other's contents at build time.
//   4. Expose GET /api/extensions/stream (SSE) — pushes a "refresh" event the
//      moment an extension folder is added/removed, so the host can re-fetch
//      the manifest instead of the user having to guess when to reload.
// ---------------------------------------------------------------------------

// wwwroot may not exist yet on a fresh checkout (it's populated by
// scripts/build.sh). WebApplication resolves its WebRootFileProvider from
// whatever is on disk at the moment CreateBuilder() runs — if the directory
// is missing then, static files stay broken even if the folder is created
// later — so this must happen *before* WebApplication.CreateBuilder(args).
var contentRootPath = Directory.GetCurrentDirectory();
var webRootPath = Path.Combine(contentRootPath, "wwwroot");
var extensionsRootPath = Path.Combine(webRootPath, "apps", "extensions");
Directory.CreateDirectory(extensionsRootPath);

var builder = WebApplication.CreateBuilder(args);

// During local development the Vue host runs on its own Vite dev server
// (default http://localhost:5173) which is a *different origin* than this
// API (http://localhost:5080). The browser enforces CORS for both the fetch()
// manifest call and the EventSource SSE connection, so we allow the known dev
// origins explicitly. In the production layout (Step 4 of the build) the host
// is copied into this same wwwroot, so everything is same-origin and CORS is
// never exercised — this policy is a dev-only convenience.
const string DevClientsCorsPolicy = "DevClients";
var devOrigins = new[]
{
    "http://localhost:5173",
    "http://127.0.0.1:5173",
};
builder.Services.AddCors(options =>
{
    options.AddPolicy(DevClientsCorsPolicy, policy =>
        policy.WithOrigins(devOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod());
});

builder.Services.AddSingleton(_ => new ExtensionChangeBroadcaster(extensionsRootPath));

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseCors(DevClientsCorsPolicy);
}

// Serves index.html for "/" and every static asset (host bundle + extension
// bundles) that lives anywhere under wwwroot.
app.UseDefaultFiles();
app.UseStaticFiles();

// Dynamic discovery: the host never imports an extension by name at build
// time. Instead it asks this endpoint "what's out there right now?" and gets
// back a URL per extension. Adding a new folder under wwwroot/apps/extensions
// makes it discoverable with zero backend code changes.
app.MapGet("/api/extensions", () =>
{
    if (!Directory.Exists(extensionsRootPath))
    {
        return Results.Ok(Array.Empty<ExtensionManifestEntry>());
    }

    var entries = Directory.GetDirectories(extensionsRootPath)
        .Select(dir => new
        {
            Name = Path.GetFileName(dir),
            RemoteEntryFile = Path.Combine(dir, "remoteEntry.js"),
        })
        .Where(x => File.Exists(x.RemoteEntryFile))
        .OrderBy(x => x.Name, StringComparer.OrdinalIgnoreCase)
        .Select(x => new ExtensionManifestEntry(x.Name, $"/apps/extensions/{x.Name}/remoteEntry.js"))
        .ToArray();

    return Results.Ok(entries);
});

// Server-Sent Events stream: pushes one "extensions-changed" event whenever
// the FileSystemWatcher below observes a folder being added/removed/renamed
// under wwwroot/apps/extensions, debounced so a multi-file copy only fires
// once. SSE (rather than polling) is a plain, dependency-free way to get
// push notifications from a Minimal API without adding SignalR.
app.MapGet("/api/extensions/stream", async (HttpContext ctx, ExtensionChangeBroadcaster broadcaster) =>
{
    ctx.Response.Headers.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    ctx.Response.Headers["X-Accel-Buffering"] = "no";

    var pending = Channel.CreateUnbounded<byte>();
    void OnChanged() => pending.Writer.TryWrite(0);
    broadcaster.Changed += OnChanged;

    try
    {
        await ctx.Response.WriteAsync(": connected\n\n", ctx.RequestAborted);
        await ctx.Response.Body.FlushAsync(ctx.RequestAborted);

        while (!ctx.RequestAborted.IsCancellationRequested)
        {
            var changeSignal = pending.Reader.ReadAsync(ctx.RequestAborted).AsTask();
            var timeout = Task.Delay(TimeSpan.FromSeconds(15), ctx.RequestAborted);
            var finished = await Task.WhenAny(changeSignal, timeout);

            if (finished == changeSignal)
            {
                await changeSignal; // observes cancellation, if any
                await ctx.Response.WriteAsync("event: extensions-changed\ndata: refresh\n\n", ctx.RequestAborted);
            }
            else
            {
                // Comment-only "ping" so intermediate proxies / browsers don't
                // time out an idle connection.
                await ctx.Response.WriteAsync(": keep-alive\n\n", ctx.RequestAborted);
            }

            await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
        }
    }
    catch (OperationCanceledException)
    {
        // Client navigated away / closed the tab — not an error.
    }
    finally
    {
        broadcaster.Changed -= OnChanged;
    }
});

// SPA fallback: any non-file, non-/api GET (e.g. a client-side route like
// /ext/extension-a) resolves to the host's index.html so vue-router can take
// over. Static files and the /api endpoints above are matched first and
// short-circuit this.
app.MapFallbackToFile("index.html");

app.Run();

/// <summary>Watches wwwroot/apps/extensions and raises a debounced Changed event on any add/remove/rename.</summary>
sealed class ExtensionChangeBroadcaster : IDisposable
{
    private readonly FileSystemWatcher _watcher;
    private readonly System.Timers.Timer _debounce;

    public event Action? Changed;

    public ExtensionChangeBroadcaster(string extensionsPath)
    {
        Directory.CreateDirectory(extensionsPath);

        // 400ms debounce: a "copy a whole extension folder in" operation
        // fires many raw filesystem events in quick succession; we only want
        // to tell the frontend once things have settled.
        _debounce = new System.Timers.Timer(400) { AutoReset = false };
        _debounce.Elapsed += (_, _) => Changed?.Invoke();

        _watcher = new FileSystemWatcher(extensionsPath)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.DirectoryName | NotifyFilters.FileName | NotifyFilters.LastWrite,
        };
        _watcher.Created += (_, _) => Restart();
        _watcher.Deleted += (_, _) => Restart();
        _watcher.Renamed += (_, _) => Restart();
        _watcher.Changed += (_, _) => Restart();
        _watcher.EnableRaisingEvents = true;
    }

    private void Restart()
    {
        _debounce.Stop();
        _debounce.Start();
    }

    public void Dispose()
    {
        _watcher.Dispose();
        _debounce.Dispose();
    }
}

record ExtensionManifestEntry(string Name, string EntryUrl);
