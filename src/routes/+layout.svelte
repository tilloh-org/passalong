<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="description" content="Manage the things you no longer need — and give them a second home." />
</svelte:head>

{@render children()}
