"use client";

import { useState } from "react";
import { getFunctions, httpsCallable } from "firebase/functions";

// IMPORTANT: Make sure your firebase.ts config is initialized
// somewhere in your application's entry point.

export default function TestFunctionPage() {
  const [response, setResponse] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const callHelloWorldFunction = async () => {
    setIsLoading(true);
    setError(null);
    setResponse("");

    try {
      const functions = getFunctions();
      const helloWorld = httpsCallable(functions, "helloWorld");
      const result = await helloWorld({ 
        message: "A test message from the client!",
        timestamp: new Date().toISOString()
      });
      
      console.log("Function result:", result.data);
      setResponse(JSON.stringify(result.data, null, 2));

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Test Cloud Function</h1>
      <p>Click the button to call the `helloWorld` Firebase Function.</p>
      <button onClick={callHelloWorldFunction} disabled={isLoading}>
        {isLoading ? "Calling..." : "Call helloWorld()"}
      </button>
      {response && (
        <div style={{ marginTop: "1rem" }}>
          <h2>Response:</h2>
          <pre
            style={{
              background: "#f4f4f4",
              padding: "1rem",
              borderRadius: "4px",
              whiteSpace: "pre-wrap",
            }}
          >
            {response}
          </pre>
        </div>
      )}
      {error && (
        <div style={{ marginTop: "1rem", color: "red" }}>
          <h2>Error:</h2>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
