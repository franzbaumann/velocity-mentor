import { useState, useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  UserPlus,
  Check,
  X,
  Clock,
  ChevronRight,
  Heart,
  MessageCircle,
  Loader2,
  UserMinus,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  useFriendsList,
  usePendingRequests,
  useSentRequests,
  useSearchAthletes,
  useSendFriendRequest,
  useRespondToRequest,
  useUnfriend,
  useFriendActivities,
  useFriendPlan,
  type FriendProfile,
} from "@/hooks/useFriends";
import { formatDistance } from "@/lib/format";
import { FriendFeed } from "@/components/community/FriendFeed";
import { WorkoutInvites } from "@/components/community/WorkoutInvites";

function FriendProfileSheet({
  friend,
  open,
  onClose,
}: {
  friend: FriendProfile | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data: activityData } = useFriendActivities(friend?.id ?? null);
  const { data: planData } = useFriendPlan(friend?.id ?? null);
  const unfriend = useUnfriend();

  const activities = (activityData?.activities ?? []) as {
    id: string;
    date: string;
    name: string;
    distance_km: number | null;
    avg_pace: string | null;
    type: string;
  }[];
  const plan = planData?.plan as {
    plan_name: string;
    philosophy: string;
    goal_race: string;
    goal_time: string;
  } | null;
  const upcomingWorkouts = (planData?.workouts ?? []) as {
    id: string;
    date: string;
    type: string;
    name: string;
    distance_km: number | null;
    duration_minutes: number | null;
  }[];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {friend && (
          <>
            <SheetHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg font-semibold">
                  {friend.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <SheetTitle className="text-lg">{friend.name}</SheetTitle>
                  {friend.goalDistance && (
                    <p className="text-sm text-muted-foreground">
                      {friend.goalDistance}
                      {friend.goalTime ? ` in ${friend.goalTime}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </SheetHeader>

            {plan && (
              <div className="mb-6">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Current Plan
                </h3>
                <div className="card-standard p-3">
                  <p className="text-sm font-medium">{plan.plan_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {plan.philosophy?.replace(/_/g, " ")}
                    {plan.goal_race ? ` · ${plan.goal_race}` : ""}
                    {plan.goal_time ? ` · ${plan.goal_time}` : ""}
                  </p>
                </div>

                {upcomingWorkouts.length > 0 && (
                  <div className="mt-3 space-y-1.5">
                    <p className="text-xs text-muted-foreground">This week</p>
                    {upcomingWorkouts.slice(0, 5).map((w) => (
                      <div
                        key={w.id}
                        className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-lg bg-muted/30"
                      >
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {w.type}
                        </Badge>
                        <span className="text-foreground">{w.name || w.type}</span>
                        {w.distance_km != null && (
                          <span className="text-muted-foreground ml-auto">{w.distance_km} km</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Recent Activities
              </h3>
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activities</p>
              ) : (
                <div className="space-y-2">
                  {activities.slice(0, 8).map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-muted/30 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">{a.name ?? a.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.date}
                          {a.distance_km ? ` · ${formatDistance(a.distance_km)}` : ""}
                          {a.avg_pace ? ` · ${a.avg_pace}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                unfriend.mutate(friend.id, {
                  onSuccess: () => {
                    toast.success(`Removed ${friend.name} from friends`);
                    onClose();
                  },
                });
              }}
              disabled={unfriend.isPending}
            >
              <UserMinus className="w-4 h-4 mr-1.5" />
              Remove friend
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default function Community() {
  const [tab, setTab] = useState("friends");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFriend, setSelectedFriend] = useState<FriendProfile | null>(null);

  const { data: friends = [], isLoading: friendsLoading } = useFriendsList();
  const { data: pendingRequests = [] } = usePendingRequests();
  const { data: sentRequests = [] } = useSentRequests();
  const search = useSearchAthletes();
  const sendRequest = useSendFriendRequest();
  const respond = useRespondToRequest();

  const handleSearch = () => {
    if (searchQuery.trim().length >= 2) {
      search.mutate(searchQuery.trim());
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto">
        <h1 className="page-title mb-6">Community</h1>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full mb-6">
            <TabsTrigger value="feed" className="flex-1">
              Feed
            </TabsTrigger>
            <TabsTrigger value="friends" className="flex-1 relative">
              Friends
              {pendingRequests.length > 0 && (
                <span className="ml-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground inline-flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="invites" className="flex-1">
              Invites
            </TabsTrigger>
          </TabsList>

          <TabsContent value="feed">
            <FriendFeed friends={friends} />
          </TabsContent>

          <TabsContent value="friends">
            {/* Search */}
            <div className="mb-6">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by username or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="pl-9"
                  />
                </div>
                <Button
                  onClick={handleSearch}
                  disabled={searchQuery.trim().length < 2 || search.isPending}
                  size="sm"
                >
                  {search.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Search"
                  )}
                </Button>
              </div>

              {search.data && search.data.length > 0 && (
                <div className="mt-3 space-y-2">
                  {search.data.map((result) => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-muted/30"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                          {result.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{result.name}</span>
                          {"username" in result && result.username && (
                            <span className="text-xs text-muted-foreground ml-1.5">@{result.username}</span>
                          )}
                        </div>
                      </div>
                      {result.is_friend ? (
                        <span className="text-xs text-muted-foreground font-medium">Already friends</span>
                      ) : result.is_pending ? (
                        <span className="text-xs text-muted-foreground font-medium">Request sent</span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            sendRequest.mutate(result.id, {
                              onSuccess: () => {
                                toast.success(`Request sent to ${result.name}`);
                                search.reset();
                                setSearchQuery("");
                              },
                              onError: (e) => toast.error(e.message),
                            });
                          }}
                          disabled={sendRequest.isPending}
                        >
                          <UserPlus className="w-4 h-4 mr-1" />
                          Add
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {search.data && search.data.length === 0 && (
                <p className="text-sm text-muted-foreground mt-3">No athletes found</p>
              )}
            </div>

            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Pending Requests
                </h2>
                <div className="space-y-2">
                  {pendingRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-muted/30"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-sm font-semibold">
                          {req.fromName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{req.fromName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8"
                          onClick={() =>
                            respond.mutate(
                              { requestId: req.id, action: "accept" },
                              {
                                onSuccess: () => toast.success(`You and ${req.fromName} are now friends`),
                              }
                            )
                          }
                          disabled={respond.isPending}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() =>
                            respond.mutate(
                              { requestId: req.id, action: "reject" },
                              {
                                onSuccess: () => toast("Request declined"),
                              }
                            )
                          }
                          disabled={respond.isPending}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sent Requests */}
            {sentRequests.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Sent Requests
                </h2>
                <div className="space-y-2">
                  {sentRequests.map((req) => (
                    <div
                      key={req.id}
                      className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-muted/30 opacity-70"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-sm font-semibold">
                          {req.toName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{req.toName}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Pending
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Friends List */}
            <div>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Friends{friends.length > 0 ? ` (${friends.length})` : ""}
              </h2>
              {friendsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : friends.length === 0 ? (
                <div className="text-center py-12">
                  <UserPlus className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No friends yet. Search above to connect with other athletes.
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {friends.map((friend) => (
                    <button
                      key={friend.id}
                      onClick={() => setSelectedFriend(friend)}
                      className="w-full flex items-center justify-between py-3 px-3 rounded-xl hover:bg-muted/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                          {friend.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{friend.name}</p>
                          {friend.goalDistance && (
                            <p className="text-xs text-muted-foreground">
                              {friend.goalDistance}
                              {friend.goalTime ? ` · ${friend.goalTime}` : ""}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="invites">
            <WorkoutInvites friends={friends} />
          </TabsContent>
        </Tabs>
      </div>

      <FriendProfileSheet
        friend={selectedFriend}
        open={!!selectedFriend}
        onClose={() => setSelectedFriend(null)}
      />
    </AppLayout>
  );
}
