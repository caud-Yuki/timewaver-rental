/** Verify seeded QA data + the exact query the AI tool uses (categoryId + orderBy order). */
const admin = require('firebase-admin');
const path = require('path');
const key = require(path.join(__dirname, '..', 'functions', 'serviceAccountKey.json'));
admin.initializeApp({ credential: admin.credential.cert(key) });
const db = admin.firestore();

(async () => {
  const cats = await db.collection('qaCategories').orderBy('order').get();
  console.log('=== Categories (' + cats.size + ') ===');
  cats.forEach(d => console.log(`  ${d.data().order}. ${d.data().name} (${d.id})`));

  // Replicate getQaByCategory's composite-index query.
  const target = 'cat_contract';
  const snap = await db.collection('qaItems').where('categoryId', '==', target).orderBy('order', 'asc').get();
  console.log(`\n=== getQaByCategory('${target}') via composite index → ${snap.size} items ===`);
  snap.forEach(d => console.log(`  Q: ${d.data().question}\n  A: ${d.data().answer.slice(0, 50)}...`));

  const all = await db.collection('qaItems').get();
  console.log(`\nTotal qaItems: ${all.size}`);
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
