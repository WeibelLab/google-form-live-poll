// Board configuration. The web app URL is public; the board key is NOT stored here,
// it travels in the link after "#k=" and is never sent to GitHub.
window.BOARD_CONFIG = {
  api: 'https://script.google.com/macros/s/AKfycbwoujNzewtlve8NA18zb2rJBQOFmDtQVKOSZMP47t8pdkGnu3x52ldKz1pH5k_hZFPK/exec',
  firebase: '', // Realtime Database URL, set after the Firebase project exists
  courses: {
    cse291a: { title: 'CSE 291A: Human-Centered AI' },
  },
};
