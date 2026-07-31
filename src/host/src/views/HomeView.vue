<!--
  Plain static view, deliberately: it's the one route that must always exist
  regardless of which (if any) extensions the backend currently has, so it
  can't depend on anything from useExtensionRegistry.js.
-->
<template>
  <div>
    <h2>Welcome</h2>
    <p>
      This host has no build-time knowledge of any extension. Every entry in the
      sidebar was discovered by calling <code>GET /api/extensions</code>
      and loaded at runtime via Module Federation.
    </p>
  </div>
</template>
