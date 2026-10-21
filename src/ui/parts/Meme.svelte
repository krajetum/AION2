<script lang="ts">
  // w/h reserve the box so the layout doesn't jump when the image loads (object-fit keeps the real aspect).
  let { src, w, h }: { src: string | undefined; w: number; h: number } = $props();
</script>

{#if src}<img class="meme" {src} alt="" width={w} height={h}>{/if}
