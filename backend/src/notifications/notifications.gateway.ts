import {
  OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

/**
 * Socket.io gateway. Clients connect with `auth: { token: <accessToken> }`.
 * Each socket joins rooms `user:<id>` and `role:<role>` so events can be
 * targeted per-user or broadcast per-role.
 */
@Injectable()
@WebSocketGateway({
  cors: { origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',') },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('WS');

  constructor(private jwt: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.headers.authorization || '').replace('Bearer ', '');
      const payload = await this.jwt.verifyAsync(token, {
        secret: (process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me').trim(),
      });
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      await client.join(`user:${payload.sub}`);
      await client.join(`role:${payload.role}`);
      this.logger.log(`Connected ${payload.role} ${payload.sub}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data?.userId) {
      this.logger.log(`Disconnected ${client.data.userId}`);
    }
  }

  emitToUser(userId: string, event: string, payload: any) {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToRole(role: string, event: string, payload: any) {
    this.server?.to(`role:${role}`).emit(event, payload);
  }
}
