// Step 3: Create a small-amount test paymentLink for Live verification
const admin = require('firebase-admin');
const serviceAccount = require('../../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const userId = 'jgqbvpkOqOZdv33T8aBfnKX6iOo2';
  const deviceId = '5sir1kvUHGG8EmSS1Zgh';
  const rentalMonths = 3;

  const appRef = await db.collection('applications').add({
    userId,
    userEmail: 'ual.yuuki@gmail.com',
    deviceId,
    rentalPeriod: rentalMonths,
    payType: 'monthly',
    status: 'consent_form_approved',
    _verification: 'live-prod-test',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const linkRef = await db.collection('paymentLinks').add({
    userId,
    deviceId,
    deviceName: 'TimeWaver Mobile (LIVE-TEST)',
    applicationId: appRef.id,
    payType: 'monthly',
    payAmount: 150,
    status: 'pending',
    _verification: 'live-prod-test',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const paymentUrl = `https://timewaver-rental--studio-3681859885-cd9c1.asia-east1.hosted.app/payment/${linkRef.id}`;
  console.log(JSON.stringify({
    applicationId: appRef.id,
    paymentLinkId: linkRef.id,
    paymentUrl,
    amount: '¥150',
    plan: '3ヶ月月次',
  }, null, 2));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
