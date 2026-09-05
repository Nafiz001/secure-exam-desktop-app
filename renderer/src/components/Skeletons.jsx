import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

// Tinted to match the app's teal surfaces rather than the library's grey default.
function Themed({ children }) {
  return (
    <SkeletonTheme baseColor="#e4efed" highlightColor="#f6fbfa" borderRadius="0.5rem">
      {children}
    </SkeletonTheme>
  );
}

export function ExamListSkeleton({ rows = 3 }) {
  return (
    <Themed>
      <ul className="list teacher-list">
        {Array.from({ length: rows }).map((_, index) => (
          <li key={index} className="teacher-list-item">
            <div className="teacher-list-head">
              <Skeleton width="30%" height="1.1rem" />
              <Skeleton width="6rem" height="1.6rem" borderRadius="999px" />
            </div>
            <div className="teacher-meta-row">
              <Skeleton width="5rem" height="1.4rem" borderRadius="999px" />
              <Skeleton width="7rem" height="1.4rem" borderRadius="999px" />
              <Skeleton width="6rem" height="1.4rem" borderRadius="999px" />
              <Skeleton width="8rem" height="1.4rem" borderRadius="999px" />
            </div>
            <div className="actions-row top-spaced">
              <Skeleton circle width="2.6rem" height="2.6rem" />
              <Skeleton circle width="2.6rem" height="2.6rem" />
              <Skeleton circle width="2.6rem" height="2.6rem" />
              <Skeleton circle width="2.6rem" height="2.6rem" />
            </div>
          </li>
        ))}
      </ul>
    </Themed>
  );
}

export function FormSkeleton({ fields = 5 }) {
  return (
    <Themed>
      <div className="form-stack">
        {Array.from({ length: fields }).map((_, index) => (
          <div key={index}>
            <Skeleton width="8rem" height="0.9rem" />
            <Skeleton height="2.6rem" />
          </div>
        ))}
      </div>
    </Themed>
  );
}

export function ListSkeleton({ rows = 3, lines = 2 }) {
  return (
    <Themed>
      <ul className="list teacher-list">
        {Array.from({ length: rows }).map((_, index) => (
          <li key={index} className="teacher-list-item">
            <Skeleton width="40%" height="1.05rem" />
            <Skeleton count={lines} height="0.85rem" />
          </li>
        ))}
      </ul>
    </Themed>
  );
}
