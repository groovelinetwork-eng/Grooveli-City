import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OrgAccessGuard, SessionGuard } from './guards';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, PasswordService, SessionGuard, OrgAccessGuard],
  exports: [AuthService, SessionService, PasswordService, SessionGuard, OrgAccessGuard],
})
export class AuthModule {}
