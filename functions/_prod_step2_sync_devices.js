// Step 2: Clear stale TEST stripeProducts and re-sync devices on LIVE Stripe
const Stripe = require('stripe');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const sm = new SecretManagerServiceClient();
  const [v] = await sm.accessSecretVersion({
    name: 'projects/studio-3681859885-cd9c1/secrets/STRIPE_LIVE_SECRET_KEY/versions/latest',
  });
  const stripe = new Stripe(new TextDecoder().decode(v.payload.data));

  // Backup existing TEST stripeProducts so we can restore them after verification
  const devSnap = await db.collection('devices').get();
  const backup = {};
  for (const d of devSnap.docs) {
    backup[d.id] = d.data().stripeProducts || null;
  }
  console.log('Backed up TEST stripeProducts for', Object.keys(backup).length, 'devices');

  // Save backup to a temp doc in Firestore so we can restore later
  await db.collection('_temp').doc('stripeProducts_test_backup').set({
    backup,
    backedUpAt: new Date().toISOString(),
  });
  console.log('Backup saved to _temp/stripeProducts_test_backup');

  // Inline replication of syncDeviceToStripe logic, calling Live Stripe directly
  for (const devDoc of devSnap.docs) {
    const dev = devDoc.data();
    console.log(`\n=== Syncing ${devDoc.id} (${dev.type}) ===`);

    const newStripeProducts = {};
    const terms = ['3m', '6m', '12m'];
    for (const term of terms) {
      const months = term === '3m' ? 3 : term === '6m' ? 6 : 12;
      const pricing = dev.price?.[term];
      if (!pricing) { console.log(`  ${term}: no pricing, skipped`); continue; }

      // Always create a fresh Product on Live (test prods don't exist here)
      const product = await stripe.products.create({
        name: `${dev.type || dev.name} - ${months}ヶ月プラン`,
        metadata: { deviceId: devDoc.id, term, deviceType: dev.type || '', _verification: 'live-prod-test' },
      });
      console.log(`  ${term}: product ${product.id}`);

      const out = { productId: product.id };
      if (pricing.monthly > 0) {
        const p = await stripe.prices.create({
          product: product.id,
          unit_amount: pricing.monthly,
          currency: 'jpy',
          recurring: { interval: 'month' },
          metadata: { deviceId: devDoc.id, term, payType: 'monthly' },
        });
        out.monthlyPriceId = p.id;
        console.log(`    monthly: ${p.id} (¥${pricing.monthly})`);
      }
      if (pricing.full > 0) {
        const p = await stripe.prices.create({
          product: product.id,
          unit_amount: pricing.full,
          currency: 'jpy',
          metadata: { deviceId: devDoc.id, term, payType: 'full' },
        });
        out.fullPriceId = p.id;
        console.log(`    full: ${p.id} (¥${pricing.full})`);
      }
      newStripeProducts[term] = out;
    }

    await devDoc.ref.update({
      stripeProducts: newStripeProducts,
      _stripeProducts_mode: 'production',
      updatedAt: admin.firestore.Timestamp.now(),
    });
    console.log(`  → Firestore updated`);
  }

  console.log('\n✓ All devices synced to LIVE Stripe.');
  process.exit(0);
})().catch(e => { console.error(e.message); console.error(e.stack); process.exit(1); });
