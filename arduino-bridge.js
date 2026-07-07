/**
 * Arduino Bridge — 웹 ↔ ESP32 실시간 통신 인터페이스
 *
 * 지원 통신 방식:
 *   1. WebSerial API (Chrome/Edge) — USB 케이블 연결
 *   2. WebSocket (ESP32 WiFi) — 무선 연결
 *   3. MQTT (브로커 경유) — 원격 연결
 *
 * 센서 데이터 프로토콜 (CSV):
 *   송신 (ESP32 → 웹):  "HR:75,TEMP:38.1,STEPS:1234,CAL:49.4"
 *   수신 (웹 → ESP32):  "CMD:LED_ON" / "CMD:CAM_START"
 */

class ArduinoBridge {
  constructor(options = {}) {
    this.mode = options.mode || 'serial'; // 'serial' | 'websocket' | 'mqtt'
    this.wsUrl = options.wsUrl || 'ws://192.168.0.100:81';
    this.mqttTopic = options.mqttTopic || 'petcare/sensor';
    this.onData = options.onData || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.ws = null;
    this.connected = false;
  }

  // ============================================================
  // WebSerial 연결 (USB)
  // ============================================================
  async connectSerial() {
    if (!navigator.serial) {
      throw new Error('WebSerial 미지원 브라우저 (Chrome/Edge 필요)');
    }
    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 115200 });
      this.connected = true;
      this.onStatus('serial-connected');

      // 읽기 스트림
      this.reader = this.port.readable.getReader();
      this._readLoop();

      // 쓰기 스트림
      this.writer = this.port.writable.getWriter();

      return true;
    } catch (err) {
      this.onStatus('serial-error');
      throw err;
    }
  }

  async _readLoop() {
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // 개행 단위로 분할
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.trim()) this._parse(line.trim());
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        this.onStatus('serial-disconnected');
      }
    }
  }

  // ============================================================
  // WebSocket 연결 (WiFi)
  // ============================================================
  connectWebSocket(url) {
    if (url) this.wsUrl = url;
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      this.connected = true;
      this.mode = 'websocket';
      this.onStatus('ws-connected');
    };

    this.ws.onmessage = (event) => {
      this._parse(event.data);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.onStatus('ws-disconnected');
    };

    this.ws.onerror = (err) => {
      this.onStatus('ws-error');
    };
  }

  // ============================================================
  // 데이터 전송
  // ============================================================
  async send(command) {
    if (!this.connected) throw new Error('Arduino not connected');
    const msg = command + '\n';
    if (this.mode === 'serial' && this.writer) {
      await this.writer.write(new TextEncoder().encode(msg));
    } else if (this.mode === 'websocket' && this.ws) {
      this.ws.send(command);
    }
  }

  async sendCommand(cmd, value) {
    return this.send(`CMD:${cmd}:${value}`);
  }

  // ============================================================
  // 데이터 파싱
  // ============================================================
  _parse(line) {
    // 포맷: "HR:75,TEMP:38.1,STEPS:1234,CAL:49.4"
    const parsed = {};
    const parts = line.split(',');
    for (const part of parts) {
      const [key, val] = part.split(':');
      switch (key) {
        case 'HR':    parsed.heartRate = parseInt(val); break;
        case 'TEMP':  parsed.temperature = parseFloat(val); break;
        case 'STEPS': parsed.steps = parseInt(val); break;
        case 'CAL':   parsed.calories = parseFloat(val); break;
        case 'WALK':  parsed.walkMin = parseInt(val); break;
        case 'DIST':  parsed.walkDist = parseFloat(val); break;
        case 'BAT':   parsed.battery = parseInt(val); break;
      }
    }
    if (Object.keys(parsed).length > 0) {
      this.onData(parsed);
    }
  }

  // ============================================================
  // 연결 종료
  // ============================================================
  async disconnect() {
    if (this.reader) {
      await this.reader.cancel();
      this.reader = null;
    }
    if (this.writer) {
      this.writer.releaseLock();
      this.writer = null;
    }
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.onStatus('disconnected');
  }
}

// ============================================================
// 사용 예시 (index.html에서 import)
// ============================================================
/**
 * const bridge = new ArduinoBridge({
 *   mode: 'websocket',
 *   wsUrl: 'ws://192.168.0.100:81',
 *   onData: (data) => {
 *     // 실시간 생체 데이터 수신
 *     STATE.bioData = data;
 *     updateBioPanel();
 *   },
 *   onStatus: (status) => {
 *     console.log('Arduino status:', status);
 *   }
 * });
 *
 * // 연결
 * await bridge.connectWebSocket();
 *
 * // 명령 전송
 * await bridge.sendCommand('LED_ON', '1');
 */

export { ArduinoBridge };
