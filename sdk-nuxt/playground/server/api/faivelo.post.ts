export default defineFaiveloWebhookHandler({
  'message.received': (event) => {
    console.log('reply from', event.data.from.address, event.data.subject)
  }
})
