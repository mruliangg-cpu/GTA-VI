// PUBLIC values only. The Supabase anon key is designed to be public (Row Level Security protects data).
// NEVER put the service role key here.
window.ULIAN_ONLINE_CONFIG = {
  supabaseUrl: '',          // e.g. 'https://abcd1234.supabase.co'
  supabaseAnonKey: '',      // Supabase -> Project Settings -> API -> anon public key
  wsUrl: 'ws://localhost:8080', // use wss://your-server.example.com in production
  allowGuestDev: false      // true only when the server runs with DEV_ALLOW_GUESTS=true
};
