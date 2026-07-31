<!-- router.js's catch-all target for routes removed via router.removeRoute(). -->
<template>
  <div>
    <h2>Extension unavailable</h2>
    <p>
      This page isn't a route the host currently knows about. Either the
      extension that used to expose it was removed from the server, or the link
      was never valid.
    </p>
    <router-link to="/">Back to Home</router-link>
  </div>
</template>

<style scoped>
a {
  color: var(--color-accent);
}
</style>
