import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AcceptPostgresInvitationDto } from './accept-invitation.dto';
import { CreatePostgresInvitationDto } from './create-invitation.dto';
import { CreatePostgresOrganizationDto } from './create-organization.dto';

describe('PostgreSQL onboarding DTOs', () => {
  it('rejects a blank Organization name', async () => {
    const errors = await validate(
      plainToInstance(CreatePostgresOrganizationDto, { name: '' }),
    );

    expect(errors).not.toHaveLength(0);
  });

  it('rejects an invitation without a future date value or supported role', async () => {
    const errors = await validate(
      plainToInstance(CreatePostgresInvitationDto, {
        email: 'not-an-email',
        expiresAt: 'not-a-date',
        role: 'OWNER',
      }),
    );

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['email', 'expiresAt', 'role']),
    );
  });

  it('requires a non-trivial opaque invitation token', async () => {
    const errors = await validate(
      plainToInstance(AcceptPostgresInvitationDto, { token: 'short' }),
    );

    expect(errors).not.toHaveLength(0);
  });
});
