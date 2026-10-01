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

- [ ] Improve provider success rates
- [ ] Expand provider health diagnostics
- [ ] Improve retry and timeout handling
- [ ] Improve unsupported-media error messages
- [ ] Expand automated format tests
- [ ] Reduce unnecessary upstream requests

## 🟡 Formats

- [ ] Improve browser-side FLAC conversion
- [ ] Improve browser-side M4A conversion
- [ ] Improve browser-side AAC conversion
- [ ] Improve browser-side Opus conversion
- [ ] Improve browser-side MP4 muxing
- [ ] Strengthen output-file validation
- [ ] Make native vs browser conversion clearer

## 🟡 User experience

- [ ] Improve mobile download flow
- [ ] Improve accessibility
- [ ] Improve progress feedback
- [ ] Improve retry controls
- [ ] Improve format selection
- [ ] Improve PWA experience
- [ ] Improve Android integration

## 🟠 Developer experience

- [ ] Expand SDK examples
- [ ] Improve SDK error types
- [ ] Add more typed helpers
- [ ] Improve API documentation
- [ ] Add integration examples
- [ ] Add release migration notes

## 🟠 Quality and security

- [ ] Expand regression tests
- [ ] Add more SSRF test cases
- [ ] Add more malformed-media tests
- [ ] Improve challenge-page detection
- [ ] Keep dependencies updated
- [ ] Continue reducing unnecessary permissions and secrets

## 🔵 Future ideas

- More public media platforms
- Better batch workflows
- Additional client applications
- Improved self-hosting documentation
- More transparent provider status information

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
