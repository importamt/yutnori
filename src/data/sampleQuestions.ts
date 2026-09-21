import type { Question } from '../game/quiz';

/**
 * 샘플 문제 10개 (모두 이미지 포함). 실제 문제는 public/questions.json 으로 교체하거나
 * 관리 탭에서 JSON 파일을 불러오면 된다.
 */
export const SAMPLE_QUESTIONS: Question[] = [
  {
    id: 'q1',
    text: '그림처럼 윷가락 네 개 중 세 개가 배(평평한 면)를 위로 보이고 있습니다. 이 결과의 이름은?',
    image: 'quiz/q1-yut-sticks.svg',
    choices: ['도', '개', '걸', '윷'],
    answer: 2,
    explanation: '배가 위로 보인 개수대로 1개 도, 2개 개, 3개 걸, 4개 윷, 모두 등이면 모.',
  },
  {
    id: 'q2',
    text: '그림처럼 윷가락 네 개가 모두 등(둥근 면)을 위로 보이면 "모"입니다. 모가 나오면 말은 몇 칸을 움직일까요?',
    image: 'quiz/q2-mo.svg',
    choices: ['3칸', '4칸', '5칸', '6칸'],
    answer: 2,
    explanation: '모는 5칸을 움직이고 한 번 더 던질 수 있습니다.',
  },
  {
    id: 'q3',
    text: '이 문양의 이름은 무엇일까요?',
    image: 'quiz/q3-taegeuk.svg',
    choices: ['태극', '단청', '팔괘', '삼족오', '연화문'],
    answer: 0,
    explanation: '태극 문양은 음(파랑)과 양(빨강)의 조화를 상징합니다.',
  },
  {
    id: 'q4',
    text: '한국 전통 오방색(五方色)에 해당하지 않는 색은?',
    image: 'quiz/q4-obangsaek.svg',
    choices: ['청(靑)', '적(赤)', '황(黃)', '녹(綠)', '백(白)', '흑(黑)'],
    answer: 3,
    explanation: '오방색은 청·적·황·백·흑 다섯 가지 색입니다.',
  },
  {
    id: 'q5',
    text: '그림처럼 상대 말이 있는 칸에 내 말이 정확히 도착하면 어떻게 될까요?',
    image: 'quiz/q5-catch.svg',
    choices: ['내 말이 집으로 돌아간다', '상대 말을 잡고 한 번 더 던진다', '두 말이 함께 움직인다'],
    answer: 1,
    explanation: '상대 말을 잡으면 그 말은 처음으로 돌아가고, 잡은 쪽은 한 번 더 던집니다.',
  },
  {
    id: 'q6',
    text: '그림의 악기는 장단을 맞추는 대표적인 국악기입니다. 이름은?',
    image: 'quiz/q6-janggu.svg',
    choices: ['북', '장구', '가야금', '해금', '태평소'],
    answer: 1,
    explanation: '장구는 허리가 가늘고 양쪽에 가죽을 댄 타악기입니다.',
  },
  {
    id: 'q7',
    text: '그림의 책은 1446년에 반포된 "훈민정음"입니다. 한글을 창제한 조선의 왕은?',
    image: 'quiz/q7-hunmin.svg',
    choices: ['태조', '세종', '성종', '정조'],
    answer: 1,
    explanation: '세종대왕은 훈민정음을 창제해 1446년 반포했습니다.',
  },
  {
    id: 'q8',
    text: '그림 속 화살이 가리키는 방향은 윷판에서 지름길에 해당합니다. 지름길로 들어갈 수 있는 조건은?',
    image: 'quiz/q8-shortcut.svg',
    choices: ['모서리 칸에 정확히 멈췄을 때', '윷이나 모가 나왔을 때', '상대 말을 잡았을 때', '아무 때나 가능'],
    answer: 0,
    explanation: '모서리(5, 10)나 방(C)에 정확히 멈춘 말만 다음 이동에서 지름길로 갑니다.',
  },
  {
    id: 'q9',
    text: '설날에 세배를 드리면 그림의 복주머니에 담아 주시는 돈을 무엇이라고 할까요?',
    image: 'quiz/q9-pouch.svg',
    choices: ['용돈', '세뱃돈', '축의금', '복돈'],
    answer: 1,
    explanation: '세배 후 받는 돈은 세뱃돈이라고 합니다.',
  },
  {
    id: 'q10',
    text: '한국의 전통 명절 중 "한가위"라고도 불리며, 음력 8월 15일인 날은?',
    image: 'quiz/q10-moon.svg',
    choices: ['설날', '단오', '추석', '동지', '정월대보름'],
    answer: 2,
    explanation: '추석은 음력 8월 15일로 한가위, 중추절이라고도 합니다.',
  },
];
