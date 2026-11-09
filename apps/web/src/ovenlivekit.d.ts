// The package ships no types. This covers only what src/publish uses, read
// from ovenlivekit@1.5.8 src/OvenLiveKit.js.
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
    setMediaStream: (stream: MediaStream) => Promise<MediaStream>;
    // Needs an absolute http(s) URL for WHIP.
    startStreaming: (
      endpointUrl: string,
      connectionConfig?: OvenLiveKitConnectionConfig,
    ) => void;
    // Closes the connection, DELETEs the WHIP resource and stops every
    // track of the stream given to setMediaStream.
    remove: () => void;
  }

  const OvenLiveKit: {
    create: (options?: {
      callbacks?: OvenLiveKitCallbacks;
    }) => OvenLiveKitInstance;
  };
  export default OvenLiveKit;
}
