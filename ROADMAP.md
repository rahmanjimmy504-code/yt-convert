# YT Convert Roadmap

This is the public roadmap for YT Convert. Items are development goals, not guaranteed release dates.

## 🟢 Foundation

- [x] Public GitHub repository
- [x] Production web application
- [x] Cloudflare deployment support
- [x] Public TypeScript SDK
- [x] PWA support
- [x] Security documentation
- [x] Public health endpoint
- [x] Batch link checker
- [x] Provider fallback architecture
- [x] Upstream media validation

## 🟡 Reliability

- [x] Improve provider success rates
- [x] Expand provider health diagnostics
- [x] Improve retry and timeout handling
- [x] Improve unsupported-media error messages
- [x] Expand automated format tests
- [x] Reduce unnecessary upstream requests

## 🟡 Formats

- [x] Improve browser-side FLAC conversion
- [x] Improve browser-side M4A conversion
- [x] Improve browser-side AAC conversion
- [x] Improve browser-side Opus conversion
- [x] Improve browser-side MP4 muxing
- [x] Strengthen output-file validation
- [x] Make native vs browser conversion clearer

## 🟡 User experience

- [x] Improve mobile download flow
- [x] Improve accessibility
- [x] Improve progress feedback
- [x] Improve retry controls
- [x] Improve format selection
- [x] Improve PWA experience
- [x] Improve Android integration

## 🟠 Developer experience

- [x] Expand SDK examples
- [x] Improve SDK error types
- [x] Add more typed helpers
- [x] Improve API documentation
- [x] Add integration examples
- [x] Add release migration notes

## 🟠 Quality and security

- [x] Expand regression tests
- [x] Add more SSRF test cases
- [x] Add more malformed-media tests
- [x] Improve challenge-page detection
- [ ] Keep dependencies updated
- [x] Continue reducing unnecessary permissions and secrets

## 🔵 Future ideas

- More public media platforms
- [x] Better batch workflows
- [x] Additional client applications
- [x] Improved self-hosting documentation
- [x] More transparent provider status information

## Principles

YT Convert aims to remain:

- **Transparent** — never pretend a failed conversion succeeded.
- **Security-conscious** — validate URLs and upstream responses.
- **Privacy-conscious** — avoid collecting unnecessary personal data.
- **Accessible** — work well on phones, tablets and desktops.
- **Affordable to operate** — prefer free/serverless infrastructure where practical.
- **Responsible** — do not build around bypassing DRM, authentication or access controls.

## Project status

YT Convert is currently presented as a **software project and product**, not as a registered company or legal entity.
