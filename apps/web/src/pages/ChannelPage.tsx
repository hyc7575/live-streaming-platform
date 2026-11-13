import { useAuth } from '../auth/auth-context';
import { ThumbnailPicture } from '../components/BroadcastThumbnail';
import { UserImageField } from '../components/UserImageField';
import { useDocumentTitle } from '../use-document-title';
import styles from './ChannelPage.module.css';

// /studio/channel: the standby image every READY broadcast of the streamer
// shows.
export function ChannelPage() {
  useDocumentTitle('내 채널');
  const { state } = useAuth();
  // RequireAuth renders this page only for a logged-in user.
  if (state.status !== 'authenticated') return null;
  const user = state.user;

  return (
    <section>
      <h1 className={styles.title}>기본 대기 이미지</h1>
      <UserImageField
        slot="standby"
        previewClassName={styles.preview}
        preview={
          <ThumbnailPicture
            status="READY"
            text={user.nickname}
            standbyImageUrl={user.standbyImageUrl}
          />
        }
        confirmText="대기 이미지를 삭제할까요? 방송 준비 중 카드와 시청 화면에 첫 글자 그림이 보입니다."
        returnTo="/studio/channel"
      />
      <p className={styles.note}>
        방송 준비 중(READY) 카드와 시청 화면에 보입니다
      </p>
    </section>
  );
}
