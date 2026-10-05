// Board configuration. The web app URL is public; the board key is NOT stored here,
// it travels in the link after "#k=" and is never sent to GitHub.
window.BOARD_CONFIG = {
  api: 'https://script.google.com/macros/s/AKfycbwoujNzewtlve8NA18zb2rJBQOFmDtQVKOSZMP47t8pdkGnu3x52ldKz1pH5k_hZFPK/exec',
  admin: 'https://script.google.com/a/macros/ucsd.edu/s/AKfycbwQ_D73yvzjz_Gg3jpo7DlhbH8wI4HGrCRUN6s7Bs1btouSh-GG8cDjeluvSUYun_3x/exec?admin',
  firebase: 'https://form-live-poll-default-rtdb.firebaseio.com',
  courses: {
    cse291a: { title: 'CSE 291A: Human-Centered AI' },
  },
};
