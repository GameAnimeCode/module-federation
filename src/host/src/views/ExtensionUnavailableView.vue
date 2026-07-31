<!--
  This is router.js's catch-all (`/:pathMatch(.*)*`) target. It exists
  because router.removeRoute() (called from useExtensionRegistry.js when an
  extension folder disappears) has no equivalent way to force a user who is
  already sitting on that route to navigate elsewhere. The next time that
  path is resolved, a fresh load or a follow-up navigation, vue-router falls
  through to this instead of throwing or rendering nothing.
-->
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
