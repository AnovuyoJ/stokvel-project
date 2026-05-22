process.env.JWT_SECRET = 'test-secret';
jest.mock('nodemailer', () => {
  const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id', response: 'OK' });
  return {
    createTransport: jest.fn().mockReturnValue({
      sendMail: mockSendMail
    })
  };
});

const nodemailer = require('nodemailer');
const {
  sendContributionReceiptEmail,
  sendInviteEmail,
  sendMeetingNotification,
  sendMissingContributionEmail,
  sendMeetingMinutes,
  sendRoleAssignedEmail,
  sendPayoutInitiatedEmail,
  sendPayoutNotificationEmail,
} = require('../services/emailService');

describe('Email Service', () => {
  // Get reference to the mocked sendMail function
  const mockSendMail = nodemailer.createTransport().sendMail;

  beforeEach(() => {
    // Reset the mock before each test
    jest.clearAllMocks();
    mockSendMail.mockResolvedValue({ messageId: 'test-id', response: 'OK' });
  });

  describe('sendContributionReceiptEmail', () => {
    it('should send contribution receipt email with correct parameters', async () => {
      const emailData = {
        toEmail: 'test@example.com',
        toName: 'Test User',
        groupName: 'Test Group',
        amount: '250.00',
        reference: 'REF-123',
        date: '2024-01-01'
      };

      await sendContributionReceiptEmail(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: process.env.EMAIL_FROM,
          to: emailData.toEmail,
          subject: expect.stringContaining('Test Group'),
        })
      );
    });

    it('should include contribution details in email body', async () => {
      const emailData = {
        toEmail: 'test@example.com',
        toName: 'Test User',
        groupName: 'Test Group',
        amount: '250.00',
        reference: 'REF-123',
        date: '2024-01-01'
      };

      await sendContributionReceiptEmail(emailData);

      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.html).toContain('R250.00');
      expect(mailOptions.html).toContain('REF-123');
      expect(mailOptions.html).toContain('Test Group');
      expect(mailOptions.html).toContain('Test User');
    });

    it('should handle email sending errors', async () => {
      mockSendMail.mockRejectedValueOnce(new Error('SMTP error'));

      const emailData = {
        toEmail: 'test@example.com',
        toName: 'Test User',
        groupName: 'Test Group',
        amount: '250.00',
        reference: 'REF-123',
        date: '2024-01-01'
      };

      await expect(sendContributionReceiptEmail(emailData))
        .rejects
        .toThrow('SMTP error');
    });

    it('should handle missing optional fields gracefully', async () => {
      const emailData = {
        toEmail: 'test@example.com',
        toName: 'Test User',
        groupName: 'Test Group',
        amount: '250.00'
      };

      await sendContributionReceiptEmail(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.html).toContain('undefined'); // reference and date are undefined
    });
  });

  describe('sendInviteEmail', () => {
    it('should send invite email with correct parameters', async () => {
      const emailData = {
        toEmail: 'newmember@example.com',
        toName: 'New Member',
        groupName: 'Test Group',
        inviterName: 'John Doe',
        inviteLink: 'https://example.com/invite/abc123'
      };

      await sendInviteEmail(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.to).toBe(emailData.toEmail);
      expect(mailOptions.subject).toContain('Test Group');
      expect(mailOptions.html).toContain('New Member');
      expect(mailOptions.html).toContain('John Doe');
      expect(mailOptions.html).toContain('https://example.com/invite/abc123');
    });

    it('should include accept button in invite email', async () => {
      const emailData = {
        toEmail: 'newmember@example.com',
        toName: 'New Member',
        groupName: 'Test Group',
        inviterName: 'John Doe',
        inviteLink: 'https://example.com/invite/abc123'
      };

      await sendInviteEmail(emailData);

      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.html).toContain('Accept Invitation');
      expect(mailOptions.html).toContain('href="https://example.com/invite/abc123"');
    });
  });

  describe('sendMeetingNotification', () => {
    it('should send meeting notification with all details', async () => {
      const emailData = {
        toEmail: 'member@example.com',
        toName: 'Jane Smith',
        groupName: 'Test Group',
        meetingDate: '2024-03-15',
        meetingTime: '14:00',
        link: 'https://meet.example.com/abc',
        venue: 'Community Hall',
        agenda: 'Discuss contributions and payouts'
      };

      await sendMeetingNotification(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.html).toContain('2024-03-15');
      expect(mailOptions.html).toContain('14:00');
      expect(mailOptions.html).toContain('Community Hall');
      expect(mailOptions.html).toContain('https://meet.example.com/abc');
      expect(mailOptions.html).toContain('Discuss contributions and payouts');
    });

    it('should handle meeting without agenda', async () => {
      const emailData = {
        toEmail: 'member@example.com',
        toName: 'Jane Smith',
        groupName: 'Test Group',
        meetingDate: '2024-03-15',
        meetingTime: '14:00',
        link: 'https://meet.example.com/abc',
        venue: 'Community Hall'
      };

      await sendMeetingNotification(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.html).not.toContain('Agenda');
    });
  });

  describe('sendMissingContributionEmail', () => {
    it('should send missing contribution warning', async () => {
      const emailData = {
        toEmail: 'member@example.com',
        toName: 'Jane Smith',
        groupName: 'Test Group',
        month: 'March 2024',
        amount: '250.00'
      };

      await sendMissingContributionEmail(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.subject).toContain('Missing Contribution');
      expect(mailOptions.html).toContain('R250.00');
      expect(mailOptions.html).toContain('March 2024');
      expect(mailOptions.html).toContain('Jane Smith');
    });
  });

  describe('sendMeetingMinutes', () => {
    it('should send meeting minutes', async () => {
      const emailData = {
        toEmail: 'member@example.com',
        toName: 'Jane Smith',
        groupName: 'Test Group',
        meetingDate: '2024-03-15',
        minutes: 'Discussed quarterly goals. Agreed on new contribution amounts. Next meeting scheduled for April 15.'
      };

      await sendMeetingMinutes(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.subject).toContain('Meeting Minutes');
      expect(mailOptions.html).toContain('Discussed quarterly goals');
      expect(mailOptions.html).toContain('2024-03-15');
    });
  });

  describe('sendRoleAssignedEmail', () => {
    it('should send role assignment notification for Treasurer', async () => {
      const emailData = {
        toEmail: 'member@example.com',
        toName: 'Jane Smith',
        groupName: 'Test Group',
        role: 'Treasurer'
      };

      await sendRoleAssignedEmail(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.subject).toContain('Treasurer');
      expect(mailOptions.html).toContain('Confirm member payments');
      expect(mailOptions.html).toContain('Flag missing contributions');
      expect(mailOptions.html).toContain('Manage payout schedules');
    });

    it('should send role assignment notification for non-Treasurer role', async () => {
      const emailData = {
        toEmail: 'member@example.com',
        toName: 'Jane Smith',
        groupName: 'Test Group',
        role: 'Secretary'
      };

      await sendRoleAssignedEmail(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.subject).toContain('Secretary');
      // Should not include Treasurer-specific duties
      expect(mailOptions.html).not.toContain('Confirm member payments');
    });
  });

  describe('sendPayoutInitiatedEmail', () => {
    it('should send payout initiated notification', async () => {
      const emailData = {
        toEmail: 'member@example.com',
        toName: 'Jane Smith',
        amount: '1000.00',
        groupName: 'Test Group',
        reference: 'PAYOUT-123'
      };

      await sendPayoutInitiatedEmail(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.subject).toContain('Payout Initiated');
      expect(mailOptions.html).toContain('R1000.00');
      expect(mailOptions.html).toContain('PAYOUT-123');
    });
  });

  describe('sendPayoutNotificationEmail', () => {
    it('should send payout received notification', async () => {
      const emailData = {
        toEmail: 'member@example.com',
        toName: 'Jane Smith',
        amount: '1000.00',
        groupName: 'Test Group',
        transactionId: 'TXN-456',
        date: new Date('2024-03-15')
      };

      await sendPayoutNotificationEmail(emailData);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const mailOptions = mockSendMail.mock.calls[0][0];
      expect(mailOptions.subject).toContain('payout');
      expect(mailOptions.html).toContain('R1000.00');
      expect(mailOptions.html).toContain('TXN-456');
    });
  });

  describe('Transporter configuration', () => {
    it('should create transporter with Gmail SMTP settings', () => {
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
        })
      );
    });

    it('should configure transporter with timeout settings', () => {
      expect(nodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionTimeout: 10000,
          greetingTimeout: 10000,
        })
      );
    });
  });

  describe('Error handling across all functions', () => {
    const allFunctions = [
      { name: 'sendContributionReceiptEmail', fn: sendContributionReceiptEmail },
      { name: 'sendInviteEmail', fn: sendInviteEmail },
      { name: 'sendMeetingNotification', fn: sendMeetingNotification },
      { name: 'sendMissingContributionEmail', fn: sendMissingContributionEmail },
      { name: 'sendMeetingMinutes', fn: sendMeetingMinutes },
      { name: 'sendRoleAssignedEmail', fn: sendRoleAssignedEmail },
      { name: 'sendPayoutInitiatedEmail', fn: sendPayoutInitiatedEmail },
      { name: 'sendPayoutNotificationEmail', fn: sendPayoutNotificationEmail },
    ];

    allFunctions.forEach(({ name, fn }) => {
      it(`${name} should throw error when sendMail fails`, async () => {
        mockSendMail.mockRejectedValueOnce(new Error('Network error'));

        const basicData = {
          toEmail: 'test@example.com',
          toName: 'Test User',
          groupName: 'Test Group',
          amount: '250.00',
          reference: 'REF-123',
          date: '2024-01-01',
          inviterName: 'Inviter',
          inviteLink: 'https://example.com',
          meetingDate: '2024-03-15',
          meetingTime: '14:00',
          link: 'https://meet.example.com',
          venue: 'Hall',
          agenda: 'Agenda',
          month: 'March',
          minutes: 'Minutes',
          role: 'Member',
          transactionId: 'TXN-123',
        };

        await expect(fn(basicData)).rejects.toThrow('Network error');
      });
    });
  });
});