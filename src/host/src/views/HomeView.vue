<!-- The one route that must always exist, so it can't depend on useExtensionRegistry.js. -->
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
