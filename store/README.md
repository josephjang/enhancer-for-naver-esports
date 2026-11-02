# Chrome 웹 스토어 등록 자료

Chrome 웹 스토어 개발자 대시보드에 확장을 올릴 때 필요한 파일과 입력값입니다. 웨일과 Edge 사용자도 Chrome 웹 스토어에서 설치할 수 있습니다.

## 1. 패키지 업로드

```sh
npm run package
```

`dist/enhancer-for-naver-esports-<버전>.zip`이 만들어집니다. 대시보드에서 **새 항목**을 누르고 이 파일을 올립니다. zip에는 브라우저가 실제로 불러오는 파일(`manifest.json`, `_locales/`, `src/`, `icons/icon-*.png`)만 들어갑니다. 버전이 `manifest.json`과 `package.json`에서 다르거나 manifest가 가리키는 파일이 빠져 있으면 zip을 만들지 않습니다.

새 버전을 올릴 때는 `manifest.json`과 `package.json`의 `version`을 함께 올린 뒤 다시 실행합니다. 스토어는 이미 올린 버전 번호를 다시 받지 않습니다.

## 2. 스토어 등록정보 (Store listing 탭)

확장 이름과 요약 설명은 zip 안의 `_locales`에서 언어별로 자동으로 들어갑니다. 기본 언어는 `manifest.json`의 `default_locale`인 영어이고, 한국어 등록정보를 추가해 언어별로 아래 값을 넣습니다.

| 항목 | 값 |
| --- | --- |
| 상세 설명 (영어) | `listing/description.en.txt` 내용 |
| 상세 설명 (한국어) | `listing/description.ko.txt` 내용 |
| 카테고리 | Entertainment (스포츠, 음악, TV, 영화 팬을 위한 확장) |
| 스토어 아이콘 | zip 안의 `icons/icon-128.png`가 쓰입니다 |
| 스크린샷 (영어) | `images/en/screenshot-1.png`, `-2.png`, `-3.png` 순서대로 |
| 스크린샷 (한국어) | `images/ko/screenshot-1.png`, `-2.png`, `-3.png` 순서대로 |
| 작은 프로모션 타일 (선택) | `images/promo-small.png` (440×280, 언어별로 올릴 수 없어 두 언어를 함께 표기) |
| 공식 URL, 홈페이지 URL | `https://github.com/josephjang/enhancer-for-naver-esports` |
| 지원 URL | `https://github.com/josephjang/enhancer-for-naver-esports/issues` |

스크린샷 1, 2는 실제 확장을 Chromium에 로드해 예시 페이지(`assets/demo-page.html`)에서 찍은 화면입니다. 실제 중계 영상, 팀, 상표가 들어가지 않도록 영상은 직접 그린 그림을 쓰고, 이미지에 "예시 화면"이라고 표시했습니다. 확장의 버튼이나 문구를 바꾸면 다시 만듭니다.

```sh
npm run store-images
```

## 3. 개인정보 보호 (Privacy practices 탭)

심사자가 읽는 항목이라 영어로 입력합니다.

**Single purpose description**

```text
Makes the video player on NAVER Esports (game.naver.com) video pages fill the browser window, and restores the page on request.
```

**Permission justification: declarativeContent**

```text
Enables the toolbar icon only on game.naver.com pages, the only site the extension works on. It does not read page content.
```

**Host permission justification** (콘텐츠 스크립트가 `https://game.naver.com/*`에서 실행되기 때문에 묻는 항목)

```text
The content script adds a "Browser fill" button to the video player on game.naver.com and resizes the player to the browser window when the user asks. It runs only on that site, reads no personal data and sends nothing anywhere.
```

**Are you using remote code?** No. 모든 코드가 zip 안에 있고 외부 스크립트를 불러오지 않습니다.

**Data usage:** 어떤 데이터 종류에도 체크하지 않습니다. 이 확장은 사용자 데이터를 수집하거나 전송하지 않습니다. 채우기 상태를 기억하는 값은 페이지의 `sessionStorage`에 탭 안에서만 저장되고 밖으로 나가지 않습니다. 아래 세 가지 확인 항목에는 모두 체크합니다.

- 승인된 용도 외에 사용자 데이터를 제3자에게 판매하거나 전송하지 않음
- 단일 목적과 무관한 용도로 사용자 데이터를 사용하거나 전송하지 않음
- 신용도 판단이나 대출 목적으로 사용자 데이터를 사용하거나 전송하지 않음

**Privacy policy URL:** 사용자 데이터를 다루지 않으므로 필수가 아닙니다. 칸을 채워야 한다면 README의 면책 항목 주소(`https://github.com/josephjang/enhancer-for-naver-esports#상표-및-면책`)를 넣습니다.

## 4. 배포 (Distribution 탭)

| 항목 | 값 |
| --- | --- |
| 공개 범위 | Public |
| 지역 | 모든 지역 |
| 게시자 유형 | non-trader (무료 개인 프로젝트) |

## 심사에서 주의할 점

- 아이콘이 네이버 브랜드 색(#03C75A)을 쓰고 이름에 NAVER가 들어가 있어, 공식 확장으로 오해받는다는 이유(사칭 금지 정책)로 반려될 수 있습니다. 반려되면 `icons/icon.svg`의 색을 바꾸고 `npm run icons`, `npm run store-images`, `npm run package` 순서로 다시 만들어 제출합니다.
- 상세 설명 끝의 면책 문구("네이버와 관련 없음")는 이 위험을 줄이기 위한 것이니 지우지 않습니다.
