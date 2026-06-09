package org.oggcoin.wallet;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Color;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicLong;

public class MainActivity extends Activity {
    private WebView webView;
    private Button backToOggButton;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        FrameLayout root = new FrameLayout(this);
        root.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        backToOggButton = new Button(this);
        backToOggButton.setText("← BACK TO OGG   ");
        backToOggButton.setTextColor(Color.WHITE);
        backToOggButton.setBackgroundColor(Color.rgb(28, 19, 13));
        backToOggButton.setPadding(18, 10, 30, 10);
        backToOggButton.setVisibility(View.GONE);
        FrameLayout.LayoutParams backParams = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        backParams.gravity = Gravity.TOP | Gravity.START;
        backParams.setMargins(16, 16, 16, 16);
        root.addView(backToOggButton, backParams);
        setContentView(root);
        backToOggButton.setOnClickListener(v -> {
            webView.loadUrl("file:///android_asset/index.html");
        });

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.addJavascriptInterface(new AndroidRpcBridge(), "AndroidRpc");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (backToOggButton != null) {
                    backToOggButton.setVisibility(url != null && !url.startsWith("file:///android_asset/") ? View.VISIBLE : View.GONE);
                }
            }
        });
        webView.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            String current = webView.getUrl();
            if (current != null && !current.startsWith("file:///android_asset/")) {
                webView.loadUrl("file:///android_asset/index.html");
            } else {
                webView.goBack();
            }
        } else {
            super.onBackPressed();
        }
    }

    public static class AndroidRpcBridge {
        private final AtomicLong idCounter = new AtomicLong(1);

        @JavascriptInterface
        public String rpc(String rpcUrl, String method, String paramsJson) {
            HttpURLConnection conn = null;
            try {
                JSONArray params;
                try {
                    params = new JSONArray(paramsJson == null || paramsJson.length() == 0 ? "[]" : paramsJson);
                } catch (Exception ignored) {
                    params = new JSONArray();
                }

                JSONObject req = new JSONObject();
                req.put("jsonrpc", "2.0");
                req.put("id", idCounter.getAndIncrement());
                req.put("method", method);
                req.put("params", params);

                URL url = new URL(rpcUrl);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");
                conn.setRequestProperty("Accept", "application/json");

                byte[] body = req.toString().getBytes(StandardCharsets.UTF_8);
                conn.setFixedLengthStreamingMode(body.length);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(body);
                }

                int code = conn.getResponseCode();
                BufferedReader br = new BufferedReader(new InputStreamReader(
                        code >= 200 && code < 300 ? conn.getInputStream() : conn.getErrorStream(),
                        StandardCharsets.UTF_8
                ));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) sb.append(line);
                br.close();

                String out = sb.toString();
                if (out == null || out.length() == 0) {
                    JSONObject err = new JSONObject();
                    err.put("error", "Empty RPC response HTTP " + code);
                    return err.toString();
                }
                return out;
            } catch (Exception e) {
                try {
                    JSONObject err = new JSONObject();
                    err.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
                    return err.toString();
                } catch (Exception ignored) {
                    return "{\"error\":\"RPC bridge error\"}";
                }
            } finally {
                if (conn != null) conn.disconnect();
            }
        }
    }
}
