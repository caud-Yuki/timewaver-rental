// Step 1: Verify Live key is set and switch settings/global.mode → 'production'
const Stripe = require('stripe');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  // Verify Live key exists
  const sm = new SecretManagerServiceClient();
  let liveKey;
  try {
    const [v] = await sm.accessSecretVersion({
      name: 'projects/studio-3681859885-cd9c1/secrets/STRIPE_LIVE_SECRET_KEY/versions/latest',
    });
    liveKey = new TextDecoder().decode(v.payload.data);
    console.log(`✓ STRIPE_LIVE_SECRET_KEY: ${liveKey.slice(0, 12)}... (length=${liveKey.length})`);
  } catch (e) {
    console.error('✗ STRIPE_LIVE_SECRET_KEY missing!'); process.exit(1);
  }

  // Verify it's actually a live key
  if (!liveKey.startsWith('sk_live_') && !liveKey.startsWith('rk_live_')) {
    console.error(`✗ Key is not a LIVE key: ${liveKey.slice(0, 8)}`); process.exit(1);
  }

  // Test the key against Live Stripe
  const stripe = new Stripe(liveKey);
  const balance = await stripe.balance.retrieve();
  console.log(`✓ Live Stripe accessible. Available balance entries: ${balance.available.length}`);

  // Check current mode
  const settingsRef = db.collection('settings').doc('global');
  const before = (await settingsRef.get()).data();
  console.log(`Current mode: ${before?.mode || '(unset)'}`);

  // Switch to production
  await settingsRef.update({
    mode: 'production',
    _modeChangedAt: new Date().toISOString(),
    _modeChangedBy: 'production-verification-script',
  });
  console.log('✓ Switched mode → production');

  // List devices that will need syncing
  const devSnap = await db.collection('devices').get();
  console.log(`\n${devSnap.size} devices in Firestore:`);
  devSnap.forEach(d => {
    const v = d.data();
    const stripeProds = v.stripeProducts || {};
    console.log(`  ${d.id} (${v.type}) — Stripe linked: 3m=${!!stripeProds['3m']}, 6m=${!!stripeProds['6m']}, 12m=${!!stripeProds['12m']}`);
  });

  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
