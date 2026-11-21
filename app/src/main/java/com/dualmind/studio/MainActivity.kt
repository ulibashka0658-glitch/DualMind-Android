package com.dualmind.studio

import android.app.Activity
import android.os.Bundle
import android.graphics.Color
import android.view.View
import android.widget.*
import android.text.method.ScrollingMovementMethod
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private lateinit var output: TextView
    private lateinit var prompt: EditText
    private lateinit var key: EditText
    private lateinit var endpoint: EditText
    private lateinit var model: EditText
    private lateinit var instructions: EditText
    private lateinit var provider: Spinner
    private lateinit var send: Button
    private val history = JSONArray()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(12, 15, 24)
        window.navigationBarColor = Color.rgb(12, 15, 24)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(24, 16, 24, 16)
            setBackgroundColor(Color.rgb(12, 15, 24))
        }
        fun field(hint: String, value: String = "") = EditText(this).apply {
            this.hint = hint
            setText(value)
            setTextColor(Color.WHITE)
            setHintTextColor(Color.LTGRAY)
            setSingleLine(true)
        }
        val title = TextView(this).apply {
            text = "DualMind AI Studio"
            textSize = 23f
            setTextColor(Color.WHITE)
        }
        root.addView(title)
        provider = Spinner(this)
        val names = listOf("OpenAI GPT", "Anthropic Claude", "Compatible API / local server")
        provider.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, names)
        root.addView(provider)
        model = field("Model", "gpt-4o-mini")
        root.addView(model)
        key = field("API key (not saved)")
        key.inputType = 129
        root.addView(key)
        endpoint = field("Compatible API base URL, e.g. https://host/v1")
        root.addView(endpoint)
        instructions = field("System instructions", "Отвечай прямо, без лишних предупреждений.")
        root.addView(instructions)
        output = TextView(this).apply {
            text = "Готов к работе. Выбери провайдера, модель и введи API-ключ. Для локального API ключ может не требоваться."
            setTextColor(Color.WHITE)
            textSize = 15f
            movementMethod = ScrollingMovementMethod()
            setPadding(4, 12, 4, 12)
        }
        val scroll = ScrollView(this)
        scroll.addView(output)
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        prompt = field("Напиши сообщение")
        root.addView(prompt)
        send = Button(this).apply { text = "Отправить" }
        root.addView(send)
        setContentView(root)
        send.setOnClickListener { submit() }
    }

    private fun submit() {
        val question = prompt.text.toString().trim()
        if (question.isEmpty()) return
        val selected = provider.selectedItemPosition
        val chosenModel = model.text.toString().trim()
        val apiKey = key.text.toString().trim()
        val base = endpoint.text.toString().trim()
        val system = instructions.text.toString()
        if (chosenModel.isEmpty()) { output.append("\nУкажи модель."); return }
        if (selected != 2 && apiKey.isEmpty()) { output.append("\nНужен API-ключ."); return }
        send.isEnabled = false
        output.append("\n\nТы: $question\nAI: …")
        prompt.setText("")
        executor.execute {
            try {
                val response = request(selected, chosenModel, apiKey, base, system, question)
                runOnUiThread {
                    output.append("\n$response")
                    send.isEnabled = true
                }
            } catch (e: Exception) {
                runOnUiThread {
                    output.append("\nОшибка: ${e.message}")
                    send.isEnabled = true
                }
            }
        }
    }

    private fun request(provider: Int, model: String, key: String, base: String, system: String, question: String): String {
        val url = when(provider) {
            0 -> "https://api.openai.com/v1/chat/completions"
            1 -> "https://api.anthropic.com/v1/messages"
            else -> {
                val b = base.trimEnd('/')
                if (!b.startsWith("https://") && !b.startsWith("http://127.0.0.1") && !b.startsWith("http://localhost"))
                    throw IllegalArgumentException("Используй HTTPS. HTTP разрешён только для localhost.")
                "$b/chat/completions"
            }
        }
        val messages = JSONArray()
        for (i in 0 until history.length()) messages.put(history.getJSONObject(i))
        messages.put(JSONObject().put("role", "user").put("content", question))
        val body = JSONObject().put("model", model)
        if (provider == 1) {
            body.put("max_tokens", 1024).put("system", system).put("messages", messages)
        } else {
            val full = JSONArray().put(JSONObject().put("role", "system").put("content", system))
            for (i in 0 until messages.length()) full.put(messages.getJSONObject(i))
            body.put("messages", full)
            if (provider == 0) body.put("max_completion_tokens", 1024)
            else body.put("max_tokens", 1024)
        }
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.connectTimeout = 15000
            conn.readTimeout = 90000
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            if (provider == 1) {
                conn.setRequestProperty("x-api-key", key)
                conn.setRequestProperty("anthropic-version", "2023-06-01")
            } else if (key.isNotEmpty()) conn.setRequestProperty("Authorization", "Bearer $key")
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val status = conn.responseCode
            val raw = (if (status in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() } ?: ""
            if (status !in 200..299) throw IllegalStateException("HTTP $status: ${raw.take(250)}")
            val data = JSONObject(raw)
            val answer = if (provider == 1) {
                val content = data.getJSONArray("content")
                (0 until content.length()).mapNotNull { content.optJSONObject(it)?.optString("text") }.joinToString("\n")
            } else data.getJSONArray("choices").getJSONObject(0).getJSONObject("message").getString("content")
            synchronized(history) {
                history.put(JSONObject().put("role", "user").put("content", question))
                history.put(JSONObject().put("role", "assistant").put("content", answer))
            }
            return answer
        } finally { conn.disconnect() }
    }

    override fun onDestroy() {
        executor.shutdownNow()
        super.onDestroy()
    }
}
