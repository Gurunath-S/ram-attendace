import { app } from './app.js';
import { env } from './config/env.js';

const PORT = env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`[A.D. GARMENTS API] Server listening on port ${PORT} (${env.NODE_ENV})`);
});
