// PUBLIC values only. The Supabase anon key is designed to be public (Row Level Security protects data).
// NEVER put the service role key here.
window.ULIAN_ONLINE_CONFIG = {
  supabaseUrl: 'https://lcmqxxyyefedccfpxmix.supabase.co',          // e.g. 'https://abcd1234.supabase.co'
  supabaseAnonKey: 'sb_publishable_CA7-Fib6k6O9zFakxUplRw_Y4VpBcSe',      // Supabase -> Project Settings -> API -> anon public key
  wsUrl: 'wss://gta-vi-k86x.onrender.com', // use wss://your-server.example.com in production
  allowGuestDev: false      // true only when the server runs with DEV_ALLOW_GUESTS=true
};
