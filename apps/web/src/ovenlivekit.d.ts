// 이 패키지에는 타입이 없다. src/publish가 쓰는 것만 다루며,
// ovenlivekit@1.5.8의 src/OvenLiveKit.js를 읽고 적었다.
declare module 'ovenlivekit' {
  interface OvenLiveKitCallbacks {
    connected?: (event: Event) => void;
    connectionClosed?: (
      type: 'ice' | 'websocket' | 'user',
      event: unknown,
    ) => void;
    iceStateChange?: (state: RTCIceConnectionState) => void;
    error?: (error: unknown) => void;
  }

  interface OvenLiveKitConnectionConfig {
    iceTransportPolicy?: RTCIceTransportPolicy;
    preferredVideoFormat?: 'H264' | 'VP8';
  }

  interface OvenLiveKitInstance {
    peerConnection: RTCPeerConnection | null;
    resourceUrl: string | null;
    setMediaStream: (stream: MediaStream) => Promise<MediaStream>;
    // WHIP에는 절대 http(s) URL이 필요하다.
    startStreaming: (
      endpointUrl: string,
      connectionConfig?: OvenLiveKitConnectionConfig,
    ) => void;
    // 연결을 닫고, WHIP 리소스를 DELETE하고, setMediaStream에 넘긴
    // 스트림의 모든 트랙을 멈춘다.
    remove: () => void;
  }

  const OvenLiveKit: {
    create: (options?: {
      callbacks?: OvenLiveKitCallbacks;
    }) => OvenLiveKitInstance;
  };
  export default OvenLiveKit;
}
