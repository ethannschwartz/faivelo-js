export default defineEventHandler(async () => {
  return sendEmail({ to: 'ada@example.com', subject: 'Welcome to Playground', html: '<h1>Hi Ada</h1><p>Your account is ready.</p>' })
})
