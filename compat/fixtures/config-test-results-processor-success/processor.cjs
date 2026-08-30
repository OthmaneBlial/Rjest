module.exports = results => ({
  ...results,
  processed: {kind: 'success-override'},
  success: false,
});
