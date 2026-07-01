import fs from "fs";
import admin from "firebase-admin";

let firebaseApp = null;

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, "\n"));
    } catch (error) {
      console.error("Unable to parse FIREBASE_SERVICE_ACCOUNT_KEY", error);
      return null;
    }
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    try {
      const file = fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, "utf8");
      return JSON.parse(file);
    } catch (error) {
      console.error("Unable to read FIREBASE_SERVICE_ACCOUNT_PATH", error);
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n"),
    };
  }

  return null;
}

function initFirebase() {
  if (firebaseApp || admin.apps.length > 0) {
    firebaseApp = admin.app();
    return firebaseApp;
  }

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    console.warn("Firebase admin credentials not configured. Push notifications will be disabled.");
    return null;
  }

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return firebaseApp;
}

export function getFirebaseApp() {
  return initFirebase();
}

export async function sendPushNotification(tokens, notification, data = {}) {
  initFirebase();

  if (!admin.apps.length || !tokens?.length) {
    return {
      successCount: 0,
      failureCount: 0,
      responses: [],
      invalidTokens: [],
    };
  }

  const safeData = Object.fromEntries(
    Object.entries({ ...data, click_action: "FLUTTER_NOTIFICATION_CLICK" })
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)])
  );

  const message = {
    notification,
    data: safeData,
    tokens,
  };

  const response = await admin.messaging().sendEachForMulticast(message);
  const invalidTokens = [];

  response.responses.forEach((resp, index) => {
    if (!resp.success) {
      const errorCode = resp.error?.code;
      if (errorCode === "messaging/registration-token-not-registered" || errorCode === "messaging/invalid-registration-token") {
        invalidTokens.push(tokens[index]);
      }
    }
  });

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    responses: response.responses,
    invalidTokens,
  };
}
