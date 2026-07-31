using System.Threading.Channels;

// Serves the compiled host and extension bundles, and exposes a discovery
// API for extension B (README.md has the full architecture and the two
// loading approaches this project compares).

// wwwroot may not exist yet on a fresh checkout. WebApplication reads its
// WebRootFileProvider from disk at CreateBuilder() time, so this must run
// first or static files stay broken even after the folder appears later.
var contentRootPath = Directory.GetCurrentDirectory();
var webRootPath = Path.Combine(contentRootPath, "wwwroot");
var extensionsRootPath = Path.Combine(webRootPath, "apps", "extensions");
Directory.CreateDirectory(extensionsRootPath);

var builder = WebApplication.CreateBuilder(args);

// Only needed in dev: the host's Vite server (:5173) is a different origin
// than this API (:5080). Production copies the host into this wwwroot, so
// everything is same-origin and this policy never runs.
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

app.UseDefaultFiles();
app.UseStaticFiles();

// Lists every built extension found under wwwroot/apps/extensions. The host
// polls this instead of importing extension B by name at build time.
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
        .Select(x => new ExtensionManifestEntry(
            x.Name,
            $"/apps/extensions/{x.Name}/remoteEntry.js",
            new DateTimeOffset(File.GetLastWriteTimeUtc(x.RemoteEntryFile)).ToUnixTimeMilliseconds()))
        .ToArray();

    return Results.Ok(entries);
});

// Pushes an "extensions-changed" event whenever the watcher below fires,
// so the host knows to re-fetch the manifest instead of polling.
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
        // Client navigated away or closed the tab, not an error.
    }
    finally
    {
        broadcaster.Changed -= OnChanged;
    }
});

// SPA fallback so vue-router can handle client-side routes directly.
app.MapFallbackToFile("index.html");

app.Run();

/// <summary>Watches wwwroot/apps/extensions and raises a debounced Changed event on any add/remove/rename/rewrite.</summary>
sealed class ExtensionChangeBroadcaster : IDisposable
{
    private readonly FileSystemWatcher _watcher;
    private readonly System.Timers.Timer _debounce;

    public event Action? Changed;

    public ExtensionChangeBroadcaster(string extensionsPath)
    {
        Directory.CreateDirectory(extensionsPath);

        // Debounced so a multi-file rebuild only fires one event.
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

sealed record ExtensionManifestEntry(string Name, string EntryUrl, long LastModifiedUnixMs);
