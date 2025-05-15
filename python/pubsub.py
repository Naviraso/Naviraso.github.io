import datetime
from typing import List, Protocol

# === Domänenschicht (Ports) ===

class ChatMessage:
    """
    Repräsentiert eine Chat-Nachricht.
    
    Attributes:
        from_user (str): Absender der Nachricht.
        to (str): Empfänger, welcher ein Benutzername, Gruppenname oder "ALL" (Broadcast) sein kann.
        message (str): Der Nachrichtentext.
        timestamp (datetime): Zeitpunkt der Nachrichtenerstellung.
    """
    def __init__(self, from_user: str, to: str, message: str, 
                 timestamp: datetime.datetime = None):
        self.from_user = from_user
        self.to = to
        self.message = message
        self.timestamp = timestamp or datetime.datetime.now()
    
    def __str__(self):
        return f"[{self.timestamp:%Y-%m-%d %H:%M:%S}] {self.from_user} -> {self.to}: {self.message}"


class IChatSubscriber(Protocol):
    """
    Schnittstelle (Port) für alle Chat-Abonnenten.
    """
    def on_message_received(self, message: ChatMessage) -> None:
        ...


# === Infrastruktur (Adapter) ===

class ChatEventBus:
    """
    Ein einfacher Event-Bus, der als zentraler Verteiler für Chat-Nachrichten dient.
    Abonnenten können sich anmelden, um Nachrichten zu erhalten.
    """
    def __init__(self):
        self.subscribers: List[IChatSubscriber] = []

    def subscribe(self, subscriber: IChatSubscriber) -> None:
        if subscriber not in self.subscribers:
            self.subscribers.append(subscriber)
            print(f"Abonniert: {subscriber}")
        else:
            print(f"{subscriber} ist bereits abonniert.")

    def unsubscribe(self, subscriber: IChatSubscriber) -> None:
        if subscriber in self.subscribers:
            self.subscribers.remove(subscriber)
            print(f"Deabonniert: {subscriber}")
        else:
            print(f"{subscriber} war nicht abonniert.")

    def publish(self, message: ChatMessage) -> None:
        print(f"\nVeröffentliche Nachricht: {message}")
        for subscriber in self.subscribers:
            subscriber.on_message_received(message)


# === Services ===

class ChatService:
    """
    Service, der die Geschäftslogik für das Versenden von Nachrichten kapselt.
    Er erhält einen Publisher (z. B. den Event-Bus), an den Nachrichten weitergegeben werden.
    """
    def __init__(self, publisher: ChatEventBus):
        self.publisher = publisher

    def send_message(self, message: ChatMessage) -> None:
        # Hier können weitere Geschäftsregeln (Validierung, Filter etc.) eingebaut werden.
        self.publisher.publish(message)


# === Adapter (UI/Console) ===

class ConsoleChatAdapter:
    """
    Adapter für einzelne Benutzer, der Nachrichten in der Konsole anzeigt.
    """
    def __init__(self, user_name: str):
        self.user_name = user_name

    def on_message_received(self, message: ChatMessage) -> None:
        # Zeige nur Nachrichten, die an diesen Benutzer gerichtet sind oder als Broadcast gesendet wurden.
        if (message.to.lower() == self.user_name.lower() or 
            message.to.lower() == "all"):
            print(f"(User {self.user_name}) {message}")

    def __str__(self):
        return f"ConsoleChatAdapter({self.user_name})"


class GroupChatAdapter:
    """
    Adapter für Gruppenchats. Eine Gruppe erhält Nachrichten, die an den Gruppennamen adressiert sind.
    """
    def __init__(self, group_name: str):
        self.group_name = group_name
        self.members: List[str] = []

    def add_member(self, user_name: str) -> None:
        if user_name not in self.members:
            self.members.append(user_name)
            print(f"{user_name} wurde der Gruppe {self.group_name} hinzugefügt.")

    def remove_member(self, user_name: str) -> None:
        if user_name in self.members:
            self.members.remove(user_name)
            print(f"{user_name} wurde aus der Gruppe {self.group_name} entfernt.")

    def on_message_received(self, message: ChatMessage) -> None:
        # Zeige nur Nachrichten an, die an diese Gruppe gesendet wurden.
        if message.to.lower() == self.group_name.lower():
            print(f"(Gruppe {self.group_name}) {message}")

    def __str__(self):
        return f"GroupChatAdapter({self.group_name}, Mitglieder: {self.members})"


# === Hauptprogramm ===

def main():
    # Erstelle den zentralen Event-Bus (Adapter für die Infrastruktur)
    event_bus = ChatEventBus()

    # Erstelle den Chat-Service und injiziere den Event-Bus
    chat_service = ChatService(event_bus)

    # Erstelle Adapter für einzelne Benutzer
    alice_adapter = ConsoleChatAdapter("Alice")
    bob_adapter = ConsoleChatAdapter("Bob")
    charlie_adapter = ConsoleChatAdapter("Charlie")

    # Abonniere die Benutzer am Event-Bus
    event_bus.subscribe(alice_adapter)
    event_bus.subscribe(bob_adapter)
    event_bus.subscribe(charlie_adapter)

    # Erstelle einen Gruppenadapter und füge Mitglieder hinzu
    dev_group = GroupChatAdapter("Developers")
    dev_group.add_member("Alice")
    dev_group.add_member("Bob")

    # Abonniere auch die Gruppe, um Nachrichten zu erhalten, die an die Gruppe adressiert sind.
    event_bus.subscribe(dev_group)

    # Simuliere den Chat-Ablauf mit verschiedenen Nachrichten:

    # 1. Alice sendet eine private Nachricht an Bob.
    chat_service.send_message(ChatMessage("Alice", "Bob", "Hallo Bob, wie geht's?"))

    # 2. Bob sendet eine Nachricht an die Gruppe "Developers".
    chat_service.send_message(ChatMessage("Bob", "Developers", "Hallo Team, gibt es Updates?"))

    # 3. Charlie sendet eine Broadcast-Nachricht an alle.
    chat_service.send_message(ChatMessage("Charlie", "ALL", "Guten Tag an alle!"))

    # 4. Zusätzliche Nachrichten zum Testen
    chat_service.send_message(ChatMessage("Alice", "Developers", "Ich arbeite gerade an einem neuen Feature."))
    chat_service.send_message(ChatMessage("Bob", "Alice", "Klingt spannend, erzähl mir mehr."))

    print("\nChat-Simulation abgeschlossen. Drücke Enter zum Beenden...")
    input()


if __name__ == "__main__":
    main()
